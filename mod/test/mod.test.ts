import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseModelsDev, priceBook } from "@openmaxxing/core";
import snapshot from "@openmaxxing/core/snapshot" with { type: "json" };
import { bundle, OUTFILE } from "../bundle.ts";
import { priceRecord, statusText, stepRecord } from "../src/meter.ts";
import { register } from "../src/register.ts";

const book = priceBook(parseModelsDev(snapshot));
const NOW = new Date(2026, 9, 5, 12).getTime();
const USAGE = { model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 4000 };

test("a step's cache writes are priced at the 5-minute rate, and a subagent's step moves to the small open-weight tier", () => {
  const writes = { ...USAGE, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000 };
  const rates = book.get("anthropic/claude-opus-5-5")?.rates;
  assert.ok(rates?.cacheWrite);
  assert.equal(priceRecord(stepRecord(writes, { id: "w", session: "s", subagent: false, time: NOW }), book).price, rates.cacheWrite);
  const main = priceRecord(stepRecord(USAGE, { id: "m", session: "s", subagent: false, time: NOW }), book);
  const sub = priceRecord(stepRecord(USAGE, { id: "a", session: "s", subagent: true, time: NOW }), book);
  assert.equal(sub.price, main.price);
  assert.ok(sub.alt < main.alt);
});

test("the line shows cents under $100, and says when the team server can't be reached", () => {
  const tally = { requests: 2, price: 4.5, alt: 0.25 };
  assert.equal(statusText(tally, { requests: 9, price: 2500, alt: 300 }, undefined), "openmaxxing · open-weight savings: session $4.25 · 30 days $2.2k");
  assert.equal(statusText(tally, tally, "unreachable"), "openmaxxing · open-weight savings: session $4.25 · 30 days $4.25 · team server unreachable");
  assert.equal(statusText(tally, tally, { days: 30, people: 1, requests: 5, price: 900, alt: 100 }), "openmaxxing · open-weight savings: session $4.25 · 30 days $4.25 · team $800 (1 person)");
});

type Hook = (...args: never[]) => unknown;

test("with a team server, each step's token counts go to it, a failed post is sent again, and the line shows the team", async () => {
  const hooks = new Map<string, Hook>();
  const posts: { url: string; headers: Record<string, string>; records: { id: string; subagent: boolean; tokens: unknown }[] }[] = [];
  const timers: (() => Promise<void>)[] = [];
  let down = false;
  const $ = {
    session: { id: async () => "s9" },
    clock: { now: async () => NOW, after: (_ms: number, run: () => Promise<void>) => void timers.push(run) },
    store: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    http: {
      fetch: async (url: string, init: { headers: Record<string, string>; body: string }) => {
        if (down) throw new TypeError("connection refused");
        posts.push({ url, headers: init.headers, records: JSON.parse(init.body).records });
        return { ok: true, status: 200, text: JSON.stringify({ days: 30, people: 3, requests: 40, price: 2000, alt: 250 }) };
      },
    },
    ui: { invalidate: () => {} },
  };
  const settle = async () => {
    while (timers.length > 0) await timers.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const step = async (e: { turnId: string; index: number; agentId?: string }) => {
    const next = async function* () {
      yield { kind: "text" };
      return { usage: USAGE };
    };
    const run = (hooks.get("turn.step") as unknown as (...a: unknown[]) => AsyncGenerator)($, e, next);
    let r = await run.next();
    while (r.done !== true) r = await run.next();
    await settle();
  };
  const hint = async () => {
    const render = hooks.get("ui.render") as unknown as (...a: unknown[]) => Promise<{ props: { hint: string } }>;
    return (await render($, { props: { hint: "" } }, async (e: unknown) => e)).props.hint;
  };

  register((event: string, a: unknown, b?: unknown) => void hooks.set(event, (b ?? a) as Hook), { server: " http://team.local:8787/ ", token: "T", user: "ada" });
  await (hooks.get("session.start") as unknown as (...a: unknown[]) => Promise<unknown>)($, {}, async (e: unknown) => e);
  await settle();
  assert.deepEqual(posts.map((p) => p.records.length), [0]);
  assert.equal(posts[0]?.url, "http://team.local:8787/openmaxxing/usage");
  assert.deepEqual(posts[0]?.headers, { "content-type": "application/json", "x-openmaxxing-token": "T", "x-openmaxxing-user": "ada" });
  assert.match(await hint(), /· team \$1\.8k \(3 people\)$/);

  down = true;
  await step({ turnId: "t1", index: 0 });
  assert.match(await hint(), /team server unreachable$/);
  down = false;
  await step({ turnId: "t1", index: 1, agentId: "a7" });
  const last = posts.at(-1);
  assert.deepEqual(last?.records.map((r) => [r.id, r.subagent]), [
    ["s9/t1/main/0", false],
    ["s9/t1/a7/1", true],
  ]);
  assert.deepEqual(last?.records[0]?.tokens, { uncached: 1000, output: 2000, cacheRead: 50000, write5m: 4000, write1h: 0 });
  assert.match(await hint(), /^openmaxxing · open-weight savings: session \$[\d.]+ · 30 days \$[\d.]+ · team \$1\.8k \(3 people\)$/);
});

test("the committed hooks module is the build of mod/src (run npm run build -w mod)", async () => {
  assert.equal(await readFile(OUTFILE, "utf8"), await bundle());
});
