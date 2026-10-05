import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, parseModelsDev, priceBook, type RequestRecord } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
import { handle } from "../src/api.ts";
import type { Redis } from "../src/teams.ts";

function memory(): Redis & { keys: () => string[] } {
  const hashes = new Map<string, Map<string, number>>();
  const strings = new Map<string, string>();
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
const post = (redis: Redis, path: string, body: unknown, now = NOW) =>
  handle(new Request(`https://x/api/teams?p=${path}`, { method: "POST", body: JSON.stringify(body) }), redis, now, "");
const get = (redis: Redis, path: string) => handle(new Request(`https://x/api/teams?p=${path}`), redis, NOW, "");

test("daily sums price exactly like the requests they came from", async () => {
  const redis = memory();
  const live = [record("1", NOW - 1000), record("2", NOW - 2 * DAY, "claude-sonnet-5"), record("3", NOW - 3 * DAY, "claude-opus-5-5", true)];
  const totals = await (await post(redis, "acme/usage", { user: USER, records: live })).json();
  const direct = buildReport({ dataset: { kind: "logs", records: live, days: 30, now: NOW }, book: priceBook(parseModelsDev(snapshot)) });
  assert.equal(totals.counted, 3);
  assert.equal(totals.requests, 3);
  assert.equal(totals.people, 1);
  assert.ok(Math.abs(totals.price - direct.hero.price) < 1e-9);
  assert.ok(Math.abs(totals.alt - direct.hero.alt) < 1e-9);
});

test("backfill counts only usage from before the first join, and running it again changes nothing", async () => {
  const redis = memory();
  const old = [record("a", NOW - 40 * DAY), record("b", NOW - 5 * DAY), record("c", NOW - 400 * DAY)];
  const first = await (await post(redis, "acme/backfill", { user: USER, records: old })).json();
  assert.equal(first.counted, 2);
  assert.equal(first.requests, 1);
  const again = await (await post(redis, "acme/backfill", { user: USER, records: [...old, record("d", NOW + 60_000)] }, NOW + 120_000)).json();
  assert.equal(again.counted, 2);
  assert.deepEqual({ requests: again.requests, price: again.price }, { requests: first.requests, price: first.price });
  await post(redis, "acme/usage", { user: "f0e1d2c3b4a59687", records: [record("e", NOW)] });
  const totals = await (await get(redis, "acme")).json();
  assert.equal(totals.people, 2);
  assert.equal(totals.requests, 2);
});

test("the team page shows the savings and how to join, and bad input is refused", async () => {
  const redis = memory();
  const empty = await (await get(redis, "acme/page")).text();
  assert.match(empty, /No usage for acme yet\./);
  assert.match(empty, /npx costmaxxing acme/);
  await post(redis, "acme/usage", { user: USER, records: [record("1", NOW)] });
  const page = await (await get(redis, "acme/page")).text();
  assert.match(page, /acme could save \$[\d.k]+ a&nbsp;year on open&#8209;weight models\./);
  assert.match(page, /Claude Opus 5\.5/);
  assert.equal((await get(redis, "API/page")).status, 404);
  assert.equal((await post(redis, "a/usage", { user: USER, records: [] })).status, 400);
  assert.equal((await post(redis, "acme/usage", { user: "Bob <script>", records: [] })).status, 400);
  assert.equal((await get(redis, "acme/usage")).status, 405);
});
