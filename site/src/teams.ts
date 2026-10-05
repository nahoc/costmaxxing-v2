import { buildReport, parseModelsDev, parseRecord, priceBook, teamTotals, type Report, type RequestRecord, type TeamTotals } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };

export interface Redis {
  run(command: (string | number)[]): Promise<unknown>;
  pipeline(commands: (string | number)[][]): Promise<unknown[]>;
}

const book = priceBook(parseModelsDev(snapshot));
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

export function teamSlug(raw: string): string | undefined {
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && slug !== "api" ? slug : undefined;
}

const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayKey = (team: string, day: string) => `t:${team}:${day}`;
const clean = (text: string) => text.replaceAll("|", "/");

export function parseUpload(body: unknown): { user: string; records: RequestRecord[] } | undefined {
  const v = body as { user?: unknown; records?: unknown } | null;
  if (typeof v?.user !== "string" || !/^[a-z0-9]{8,64}$/.test(v.user) || !Array.isArray(v.records) || v.records.length > MAX_RECORDS) {
    return undefined;
  }
  const records = v.records.flatMap((entry) => {
    const record = parseRecord(JSON.stringify(entry));
    return record && record.harness === "Claude Code" ? [record] : [];
  });
  return { user: v.user, records };
}

function cells(team: string, user: string, ns: "l" | "b", records: RequestRecord[]): (string | number)[] {
  const sums = new Map<string, number>();
  for (const record of records) {
    const base = `${dayKey(team, utcDay(record.time))}\n${ns}|${user}|${clean(record.model)}|${record.subagent ? 1 : 0}`;
    for (const [short, name] of FIELDS) {
      const n = name === "requests" ? (record.requests ?? 1) : Math.round(record.tokens[name]);
      if (n > 0) sums.set(`${base}|${short}`, (sums.get(`${base}|${short}`) ?? 0) + n);
    }
  }
  return [...sums].flatMap(([cell, n]) => [...cell.split("\n"), n]);
}

export async function addLive(redis: Redis, team: string, user: string, records: RequestRecord[]): Promise<void> {
  const args = cells(team, user, "l", records);
  if (args.length > 0) await redis.run(["EVAL", ADD, 0, TTL, "add", ...args]);
  await redis.run(["DEL", `t:${team}:totals`]);
}

export async function addBackfill(redis: Redis, team: string, user: string, records: RequestRecord[], now: number): Promise<number> {
  await redis.run(["SET", `t:${team}:joined:${user}`, now, "NX"]);
  const joined = Number((await redis.run(["GET", `t:${team}:joined:${user}`])) ?? now);
  const before = records.filter((record) => record.time < joined && record.time >= now - 366 * DAY);
  const args = cells(team, user, "b", before);
  for (let i = 0; i < args.length; i += 3 * 4000) await redis.run(["EVAL", ADD, 0, TTL, "max", ...args.slice(i, i + 3 * 4000)]);
  await redis.run(["DEL", `t:${team}:totals`]);
  return before.reduce((n, record) => n + (record.requests ?? 1), 0);
}

export async function readRecords(redis: Redis, team: string, days: number, now: number): Promise<RequestRecord[]> {
  const list = Array.from({ length: days }, (_, i) => utcDay(now - i * DAY));
  const hashes = await redis.pipeline(list.map((day) => ["HGETALL", dayKey(team, day)]));
  const rows = new Map<string, RequestRecord>();
  list.forEach((day, i) => {
    const flat = (hashes[i] ?? []) as string[];
    for (let j = 0; j + 1 < flat.length; j += 2) {
      const [, user = "", model = "", sub = "0", short = ""] = (flat[j] ?? "").split("|");
      const name = FIELDS.find(([s]) => s === short)?.[1];
      if (!name) continue;
      const id = `${day}|${user}|${model}|${sub}`;
      const row = rows.get(id) ?? {
        id,
        harness: "Claude Code" as const,
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

export function teamReport(records: RequestRecord[], days: number, now: number): Report {
  return buildReport({ dataset: { kind: "logs", records, days, now: Date.parse(`${utcDay(now)}T23:59:59Z`) }, book });
}

export async function monthTotals(redis: Redis, team: string, now: number): Promise<TeamTotals> {
  const cached = await redis.run(["GET", `t:${team}:totals`]);
  if (typeof cached === "string") return JSON.parse(cached) as TeamTotals;
  const totals = teamTotals(teamReport(await readRecords(redis, team, 30, now), 30, now));
  await redis.run(["SET", `t:${team}:totals`, JSON.stringify(totals), "EX", 60]);
  return totals;
}
