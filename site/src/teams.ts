import { buildReport, parseModelsDev, parseRecord, priceBook, teamTotals, type PriceBook, type Rates, type Report, type RequestRecord, type Scenario, type TeamPricing, type TeamTotals } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };

export interface Redis {
  run(command: (string | number)[]): Promise<unknown>;
  pipeline(commands: (string | number)[][]): Promise<unknown[]>;
}

const catalog = parseModelsDev(snapshot);
const book = priceBook(catalog);
const DAY = 86_400_000;
const TTL = 400 * 86_400;
const MAX_RECORDS = 20_000;
const FIELDS = [
  ["n", "requests"],
  ["u", "uncached"],
  ["o", "output"],
  ["r", "cacheRead"],
  ["w", "write5m"],
  ["h", "write1h"],
] as const;

const ADD = `local ttl = tonumber(ARGV[1])
local mode = ARGV[2]
for i = 3, #ARGV, 3 do
  if mode == 'max' then
    local now = tonumber(redis.call('HGET', ARGV[i], ARGV[i + 1]) or '0')
    if tonumber(ARGV[i + 2]) > now then redis.call('HSET', ARGV[i], ARGV[i + 1], ARGV[i + 2]) end
  else
    redis.call('HINCRBY', ARGV[i], ARGV[i + 1], ARGV[i + 2])
  end
  redis.call('EXPIRE', ARGV[i], ttl)
end
return 1`;

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const ID = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?-[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/;

export function teamSlug(raw: string): string | undefined {
  const id = raw.trim().toLowerCase();
  return ID.test(id) ? id : undefined;
}

export function newTeamId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "") || "team";
  const random = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => ALPHABET[b % 32]).join("");
  return `${slug}-${random.slice(0, 5)}-${random.slice(5)}`;
}

export interface TeamMeta {
  name: string;
  created: number;
  pricing?: TeamPricing;
  adminHash?: string;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAdmin(meta: TeamMeta, key: string | null): Promise<boolean> {
  return Boolean(key && meta.adminHash && (await sha256(key)) === meta.adminHash);
}

const RATE_KEYS = ["input", "output", "cacheRead", "cacheWrite", "cacheWrite1h"] as const;

export function parsePricing(value: unknown): TeamPricing | undefined {
  const v = value as { scenario?: unknown; prices?: unknown } | null | undefined;
  if (!v || typeof v !== "object") return undefined;
  const prices: Record<string, Partial<Rates>> = {};
  if (v.prices && typeof v.prices === "object") {
    for (const [ref, rates] of Object.entries(v.prices as Record<string, unknown>).slice(0, 50)) {
      if (!/^[\w.-]+\/[\w./:-]+$/.test(ref) || !rates || typeof rates !== "object") continue;
      const clean: Partial<Rates> = {};
      for (const key of RATE_KEYS) {
        const n = (rates as Record<string, unknown>)[key];
        if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 10_000) clean[key] = n;
      }
      if (clean.input !== undefined && clean.output !== undefined) prices[ref] = clean;
    }
  }
  const known = priceBook(catalog, prices);
  let scenario: Scenario | undefined;
  const sc = v.scenario as { name?: unknown; routes?: unknown } | undefined;
  if (sc && typeof sc.name === "string" && Array.isArray(sc.routes) && sc.routes.length > 0 && sc.routes.length <= 20) {
    const routes = sc.routes.flatMap((r): [string, string][] =>
      Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "string" && known.has(r[1]) ? [[r[0].slice(0, 80), r[1]]] : [],
    );
    if (routes.length === sc.routes.length) scenario = { name: sc.name.slice(0, 60), routes };
  }
  if (!scenario && Object.keys(prices).length === 0) return undefined;
  return { ...(scenario && { scenario }), ...(Object.keys(prices).length > 0 && { prices }) };
}

function bookFor(pricing: TeamPricing | undefined): PriceBook {
  return pricing?.prices ? priceBook(catalog, pricing.prices) : book;
}

export async function createTeam(
  redis: Redis,
  name: string,
  pricing: TeamPricing | undefined,
  now: number,
): Promise<{ id: string; name: string; admin: string; pricing?: TeamPricing }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60) || "Team";
  const admin = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const adminHash = await sha256(admin);
  for (;;) {
    const id = newTeamId(clean);
    const meta: TeamMeta = { name: clean, created: now, adminHash, ...(pricing && { pricing }) };
    if ((await redis.run(["SET", `t:${id}:meta`, JSON.stringify(meta), "NX"])) === "OK") return { id, name: clean, admin, ...(pricing && { pricing }) };
  }
}

async function teamKeys(redis: Redis, id: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = (await redis.run(["SCAN", cursor, "MATCH", `t:${id}:*`, "COUNT", 1000])) as [string, string[]];
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

export async function rotateTeam(redis: Redis, id: string, meta: TeamMeta): Promise<string> {
  const keys = await teamKeys(redis, id);
  for (;;) {
    const next = newTeamId(meta.name);
    if ((await redis.run(["EXISTS", `t:${next}:meta`])) === 1) continue;
    await redis.pipeline(keys.map((key) => ["RENAME", key, `t:${next}:${key.slice(`t:${id}:`.length)}`]));
    await redis.run(["SET", `moved:${id}`, next, "EX", 90 * 86_400]);
    return next;
  }
}

export async function deleteTeam(redis: Redis, id: string): Promise<void> {
  const keys = await teamKeys(redis, id);
  for (let i = 0; i < keys.length; i += 500) await redis.run(["DEL", ...keys.slice(i, i + 500)]);
}

export async function setPricing(redis: Redis, id: string, meta: TeamMeta, pricing: TeamPricing | undefined): Promise<TeamMeta> {
  const { pricing: _, ...rest } = meta;
  const next: TeamMeta = { ...rest, ...(pricing && { pricing }) };
  await redis.pipeline([["SET", `t:${id}:meta`, JSON.stringify(next)], ["DEL", `t:${id}:totals`]]);
  return next;
}

export async function movedFor(redis: Redis, id: string, user: string): Promise<string | undefined> {
  const next = await redis.run(["GET", `moved:${id}`]);
  if (typeof next !== "string") return undefined;
  return (await redis.run(["SISMEMBER", `t:${next}:members`, user])) === 1 ? next : undefined;
}

export async function teamMeta(redis: Redis, id: string): Promise<TeamMeta | undefined> {
  const raw = await redis.run(["GET", `t:${id}:meta`]);
  return typeof raw === "string" ? (JSON.parse(raw) as TeamMeta) : undefined;
}

export async function overLimit(redis: Redis, bucket: string, max: number, now: number): Promise<boolean> {
  const key = `rl:${bucket}:${Math.floor(now / 60_000)}`;
  const n = Number(await redis.run(["INCR", key]));
  if (n === 1) await redis.run(["EXPIRE", key, 120]);
  return n > max;
}

const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayKey = (team: string, day: string) => `t:${team}:${day}`;
const clean = (text: string) => text.replaceAll("|", "/");

export interface Upload {
  user: string;
  records: RequestRecord[];
  sessions: Map<string, string[]>;
}

export function parseUpload(body: unknown): Upload | undefined {
  const v = body as { user?: unknown; records?: unknown; sessions?: unknown } | null;
  if (typeof v?.user !== "string" || !/^[a-z0-9]{8,64}$/.test(v.user) || !Array.isArray(v.records) || v.records.length > MAX_RECORDS) {
    return undefined;
  }
  const records = v.records.flatMap((entry) => {
    const record = parseRecord(JSON.stringify(entry));
    return record ? [record] : [];
  });
  const sessions = new Map<string, string[]>();
  for (const record of records) if (record.session) sessions.set(utcDay(record.time), [...(sessions.get(utcDay(record.time)) ?? []), record.session]);
  if (v.sessions && typeof v.sessions === "object") {
    for (const [day, ids] of Object.entries(v.sessions as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(ids)) continue;
      const clean = ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 80).slice(0, 2000);
      sessions.set(day, [...(sessions.get(day) ?? []), ...clean]);
    }
  }
  return { user: v.user, records, sessions };
}

const HARNESS = { "Claude Code": "c", Codex: "x" } as const;

function cells(team: string, user: string, ns: "l" | "b", records: RequestRecord[]): (string | number)[] {
  const sums = new Map<string, number>();
  for (const record of records) {
    const base = `${dayKey(team, utcDay(record.time))}\n${ns}|${user}|${clean(record.model)}|${record.subagent ? 1 : 0}|${HARNESS[record.harness]}`;
    for (const [short, name] of FIELDS) {
      const n = name === "requests" ? (record.requests ?? 1) : Math.round(record.tokens[name]);
      if (n > 0) sums.set(`${base}|${short}`, (sums.get(`${base}|${short}`) ?? 0) + n);
    }
  }
  return [...sums].flatMap(([cell, n]) => [...cell.split("\n"), n]);
}

async function addSessions(redis: Redis, team: string, sessions: Map<string, string[]>, keep: (day: string) => boolean): Promise<void> {
  const commands: (string | number)[][] = [];
  for (const [day, ids] of sessions) {
    if (!keep(day) || ids.length === 0) continue;
    commands.push(["PFADD", `t:${team}:s:${day}`, ...ids], ["EXPIRE", `t:${team}:s:${day}`, TTL]);
  }
  if (commands.length > 0) await redis.pipeline(commands);
}

export async function addLive(redis: Redis, team: string, upload: Upload): Promise<void> {
  const args = cells(team, upload.user, "l", upload.records);
  if (args.length > 0) await redis.run(["EVAL", ADD, 0, TTL, "add", ...args]);
  await addSessions(redis, team, upload.sessions, () => true);
  await redis.run(["SADD", `t:${team}:members`, upload.user]);
  await redis.run(["DEL", `t:${team}:totals`]);
}

export async function addBackfill(redis: Redis, team: string, upload: Upload, now: number): Promise<number> {
  await redis.run(["SET", `t:${team}:joined:${upload.user}`, now, "NX"]);
  const joined = Number((await redis.run(["GET", `t:${team}:joined:${upload.user}`])) ?? now);
  const before = upload.records.filter((record) => record.time < joined && record.time >= now - 366 * DAY);
  const args = cells(team, upload.user, "b", before);
  for (let i = 0; i < args.length; i += 3 * 4000) await redis.run(["EVAL", ADD, 0, TTL, "max", ...args.slice(i, i + 3 * 4000)]);
  await addSessions(redis, team, upload.sessions, (day) => Date.parse(`${day}T00:00:00Z`) < joined);
  await redis.run(["SADD", `t:${team}:members`, upload.user]);
  await redis.run(["DEL", `t:${team}:totals`]);
  return before.reduce((n, record) => n + (record.requests ?? 1), 0);
}

const days = (n: number, now: number) => Array.from({ length: n }, (_, i) => utcDay(now - i * DAY));

export async function readRecords(redis: Redis, team: string, span: number, now: number): Promise<RequestRecord[]> {
  const list = days(span, now);
  const hashes = await redis.pipeline(list.map((day) => ["HGETALL", dayKey(team, day)]));
  const rows = new Map<string, RequestRecord>();
  list.forEach((day, i) => {
    const flat = (hashes[i] ?? []) as string[];
    for (let j = 0; j + 1 < flat.length; j += 2) {
      const parts = (flat[j] ?? "").split("|");
      const [, user = "", model = "", sub = "0"] = parts;
      const tool = parts.length === 6 ? parts[4] : "c";
      const short = parts.at(-1) ?? "";
      const name = FIELDS.find(([f]) => f === short)?.[1];
      if (!name) continue;
      const id = `${day}|${user}|${model}|${sub}|${tool}`;
      const row = rows.get(id) ?? {
        id,
        harness: tool === "x" ? ("Codex" as const) : ("Claude Code" as const),
        model,
        time: Date.parse(`${day}T12:00:00Z`),
        session: "",
        subagent: sub === "1",
        user,
        requests: 0,
        tokens: { uncached: 0, output: 0, cacheRead: 0, write5m: 0, write1h: 0 },
      };
      const n = Number(flat[j + 1]);
      if (name === "requests") row.requests = (row.requests ?? 0) + n;
      else row.tokens[name] += n;
      rows.set(id, row);
    }
  });
  return [...rows.values()].filter((row) => (row.requests ?? 0) > 0);
}

export async function sessionCount(redis: Redis, team: string, span: number, now: number): Promise<number> {
  return Number(await redis.run(["PFCOUNT", ...days(span, now).map((day) => `t:${team}:s:${day}`)]));
}

export function teamReport(records: RequestRecord[], span: number, now: number, pricing?: TeamPricing): Report {
  return buildReport({
    dataset: { kind: "logs", records, days: span, now: Date.parse(`${utcDay(now)}T23:59:59Z`) },
    book: bookFor(pricing),
    ...(pricing?.scenario && { hero: pricing.scenario }),
  });
}

export async function monthTotals(redis: Redis, team: string, now: number, pricing?: TeamPricing): Promise<TeamTotals> {
  const cached = await redis.run(["GET", `t:${team}:totals`]);
  if (typeof cached === "string") return JSON.parse(cached) as TeamTotals;
  const totals = teamTotals(teamReport(await readRecords(redis, team, 30, now), 30, now, pricing));
  await redis.run(["SET", `t:${team}:totals`, JSON.stringify(totals), "EX", 60]);
  return totals;
}
