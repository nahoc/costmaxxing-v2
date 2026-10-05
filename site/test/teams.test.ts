import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, parseModelsDev, priceBook, type RequestRecord } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
import { handle } from "../src/api.ts";
import type { Redis } from "../src/teams.ts";

function memory(): Redis & { keys: () => string[] } {
  const hashes = new Map<string, Map<string, number>>();
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const run = async (c: (string | number)[]): Promise<unknown> => {
    const [op, ...a] = c.map(String);
    if (op === "EVAL") {
      const [, , , mode, ...rest] = a;
      for (let i = 0; i < rest.length; i += 3) {
        const h = hashes.get(rest[i]!) ?? new Map<string, number>();
        const now = h.get(rest[i + 1]!) ?? 0;
        const n = Number(rest[i + 2]);
        h.set(rest[i + 1]!, mode === "max" ? Math.max(now, n) : now + n);
        hashes.set(rest[i]!, h);
      }
      return 1;
    }
    if (op === "SET") {
      if (a.includes("NX") && strings.has(a[0]!)) return null;
      strings.set(a[0]!, a[1]!);
      return "OK";
    }
    if (op === "GET") return strings.get(a[0]!) ?? null;
    if (op === "INCR") {
      const n = Number(strings.get(a[0]!) ?? 0) + 1;
      strings.set(a[0]!, String(n));
      return n;
    }
    if (op === "EXPIRE") return 1;
    if (op === "PFADD") {
      const set = sets.get(a[0]!) ?? new Set<string>();
      for (const id of a.slice(1)) set.add(id);
      sets.set(a[0]!, set);
      return 1;
    }
    if (op === "PFCOUNT") return new Set(a.flatMap((k) => [...(sets.get(k) ?? [])])).size;
    if (op === "DEL") return Number(strings.delete(a[0]!));
    if (op === "HGETALL") return [...(hashes.get(a[0]!) ?? [])].flatMap(([k, v]) => [k, String(v)]);
    throw new Error(`unexpected ${op}`);
  };
  return { run, pipeline: (cs) => Promise.all(cs.map(run)), keys: () => [...hashes.keys()] };
}

const NOW = Date.parse("2026-10-05T15:00:00Z");
const DAY = 86_400_000;
const USER = "a1b2c3d4e5f60718";
const record = (id: string, time: number, model = "claude-opus-5-5", subagent = false): RequestRecord => ({
  id,
  harness: "Claude Code",
  model,
  time,
  session: "s",
  subagent,
  tokens: { uncached: 900, output: 1800, cacheRead: 60_000, write5m: 3000, write1h: 1500 },
});
const post = (redis: Redis, path: string, body: unknown, now = NOW, ip = "1.2.3.4") =>
  handle(new Request(`https://x/api/teams?p=${path}`, { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } }), redis, now, "");
const get = (redis: Redis, path: string, ip = "1.2.3.4") => handle(new Request(`https://x/api/teams?p=${path}`, { headers: { "x-forwarded-for": ip } }), redis, NOW, "");
const create = async (redis: Redis, name = "Acme Robotics", pricing?: unknown) =>
  ((await (await post(redis, "", { name, pricing })).json()) as { id: string }).id;

test("daily sums price exactly like the requests they came from", async () => {
  const redis = memory();
  const acme = await create(redis);
  const live = [record("1", NOW - 1000), record("2", NOW - 2 * DAY, "claude-sonnet-5"), record("3", NOW - 3 * DAY, "claude-opus-5-5", true)];
  const totals = await (await post(redis, `${acme}/usage`, { user: USER, records: live })).json();
  const direct = buildReport({ dataset: { kind: "logs", records: live, days: 30, now: NOW }, book: priceBook(parseModelsDev(snapshot)) });
  assert.equal(totals.counted, 3);
  assert.equal(totals.requests, 3);
  assert.equal(totals.people, 1);
  assert.ok(Math.abs(totals.price - direct.hero.price) < 1e-9);
  assert.ok(Math.abs(totals.alt - direct.hero.alt) < 1e-9);
});

test("backfill counts only usage from before the first join, and running it again changes nothing", async () => {
  const redis = memory();
  const acme = await create(redis);
  const old = [record("a", NOW - 40 * DAY), record("b", NOW - 5 * DAY), record("c", NOW - 400 * DAY)];
  const first = await (await post(redis, `${acme}/backfill`, { user: USER, records: old })).json();
  assert.equal(first.counted, 2);
  assert.equal(first.requests, 1);
  const again = await (await post(redis, `${acme}/backfill`, { user: USER, records: [...old, record("d", NOW + 60_000)] }, NOW + 120_000)).json();
  assert.equal(again.counted, 2);
  assert.deepEqual({ requests: again.requests, price: again.price }, { requests: first.requests, price: first.price });
  await post(redis, `${acme}/usage`, { user: "f0e1d2c3b4a59687", records: [record("e", NOW)] });
  const totals = await (await get(redis, acme)).json();
  assert.equal(totals.people, 2);
  assert.equal(totals.requests, 2);
});

test("the team page shows the savings and how to join, and bad input is refused", async () => {
  const redis = memory();
  const acme = await create(redis);
  const empty = await (await get(redis, `${acme}/page`)).text();
  assert.match(empty, /No usage for Acme Robotics yet\./);
  assert.ok(empty.includes(`npx costmaxxing ${acme}`));
  await post(redis, `${acme}/usage`, { user: USER, records: [record("1", NOW)] });
  const page = await (await get(redis, `${acme}/page`)).text();
  assert.match(page, /Acme Robotics could save \$[\d.k]+ a&nbsp;year on open&#8209;weight models\./);
  assert.match(page, /Claude Opus 5\.5/);
  assert.equal((await post(redis, "a/usage", { user: USER, records: [] })).status, 404);
  assert.equal((await post(redis, `${acme}/usage`, { user: "Bob <script>", records: [] })).status, 400);
  assert.equal((await get(redis, `${acme}/usage`)).status, 405);
});

test("teams get unguessable IDs; unknown and plain-name IDs are 404s, and guessing and creating are rate limited", async () => {
  const redis = memory();
  const id = await create(redis, "Acme Robotics!");
  assert.match(id, /^acme-robotics-[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
  assert.notEqual(await create(redis), id);
  assert.equal((await get(redis, id)).status, 200);
  assert.equal((await get(redis, "acme")).status, 404);
  assert.equal((await get(redis, "acme-robotics-aaaaa-bbbbb")).status, 404);
  assert.equal((await get(redis, "acme-robotics-aaaaa-bbbbb/page")).status, 404);
  assert.equal((await post(redis, "acme/usage", { user: USER, records: [] })).status, 404);
  const statuses = [];
  for (let i = 0; i < 31; i++) statuses.push((await get(redis, `nope-${i}`, "9.9.9.9")).status);
  assert.deepEqual([statuses[29], statuses[30]], [404, 429]);
  const created = [];
  for (let i = 0; i < 6; i++) created.push((await post(redis, "", { name: "spam" }, NOW, "8.8.8.8")).status);
  assert.deepEqual(created, [201, 201, 201, 201, 201, 429]);
});

test("Codex counts beside Claude Code, sessions are counted, and the page splits by tool with a forecast", async () => {
  const redis = memory();
  const acme = await create(redis);
  const codex = { ...record("x1", NOW - 1000, "gpt-5.6-sol"), harness: "Codex" as const, session: "codex-1" };
  await post(redis, `${acme}/usage`, { user: USER, records: [{ ...record("c1", NOW - 1000), session: "cc-1" }, { ...record("c2", NOW - 2000), session: "cc-1" }, codex] });
  await post(redis, `${acme}/backfill`, { user: "f0e1d2c3b4a59687", records: [{ ...record("b1", NOW - 3 * DAY), session: "" }], sessions: { [new Date(NOW - 3 * DAY).toISOString().slice(0, 10)]: ["old-1", "old-2"] } });
  const page = await (await get(redis, `${acme}/page`)).text();
  assert.match(page, /<dt>4<\/dt><dd>sessions, last 30 days/);
  assert.match(page, /<dt>4<\/dt><dd>requests, last 30 days/);
  assert.match(page, /By tool, last 30 days/);
  assert.match(page, /<td>Codex<\/td><td class="num">1<\/td>/);
  assert.match(page, /At the 7-day average pace/);
  assert.match(page, /At the 30-day average pace/);
});

test("team pricing from the starter's config decides the comparison everywhere", async () => {
  const redis = memory();
  const pricing = {
    scenario: { name: "Opus on Kimi", routes: [["claude-opus-*", "boundless/kimi-k3"]] },
    prices: { "boundless/kimi-k3": { input: 2.3, output: 11.4, cacheRead: 0.23 } },
  };
  const kimi = await create(redis, "Kimi Fans", pricing);
  const plain = await create(redis, "Plain");
  for (const id of [kimi, plain]) await post(redis, `${id}/usage`, { user: USER, records: [record("1", NOW)] });
  const priced = await (await get(redis, kimi)).json();
  const defaults = await (await get(redis, plain)).json();
  assert.deepEqual(priced.pricing.scenario.routes, [["claude-opus-*", "boundless/kimi-k3"]]);
  assert.equal(defaults.pricing, null);
  assert.equal(priced.price, defaults.price);
  assert.notEqual(priced.alt, defaults.alt);
  assert.match(await (await get(redis, `${kimi}/page`)).text(), /Compared with Opus on Kimi\./);
  const bogus = await create(redis, "Bogus", { scenario: { name: "x", routes: [["*", "nowhere/model"]] } });
  assert.equal((await (await get(redis, bogus)).json()).pricing, null);
});
