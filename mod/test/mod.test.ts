import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseModelsDev, priceBook } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
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

test("a team's own comparison prices the same request differently, from the team's price overrides", () => {
  const overrides = priceBook(parseModelsDev(snapshot), { "boundless/kimi-k3": { input: 2.3, output: 11.4, cacheRead: 0.23 } });
  const record = stepRecord(USAGE, { id: "k", session: "s", subagent: false, time: NOW });
  const plain = priceRecord(record, book);
  const kimi = priceRecord(record, overrides, { name: "Opus on Kimi", routes: [["claude-opus-*", "boundless/kimi-k3"]] });
  assert.equal(kimi.price, plain.price);
  assert.ok(Math.abs(kimi.alt - (1000 * 2.3 + 2000 * 11.4 + 50000 * 0.23 + 4000 * 2.3) / 1e6) < 1e-12);
});

test("the line shows cents under $100, and says when the team server can't be reached", () => {
  const tally = { requests: 2, price: 4.5, alt: 0.25 };
  assert.equal(statusText(tally, { requests: 9, price: 2500, alt: 300 }, undefined), "costmaxxing  Current session: $4.25 │ Last 30 days: $2.2k (you)");
  assert.equal(statusText(tally, tally, "unreachable"), "costmaxxing  Current session: $4.25 │ Last 30 days: $4.25 (you) │ team server unreachable");
  assert.equal(statusText(tally, tally, { days: 30, people: 1, requests: 5, price: 900, alt: 100 }), "costmaxxing  Current session: $4.25 │ Last 30 days: $4.25 (you) – $800 (team) │ 1 person");
  assert.equal(statusText(tally, tally, "missing"), "costmaxxing  Current session: $4.25 │ Last 30 days: $4.25 (you) │ team ID not found");
  assert.equal(statusText(tally, tally, undefined, 0.12), "costmaxxing  Current session: $4.25 ▲ +$0.12 │ Last 30 days: $4.25 (you)");
});

type Hook = (...args: never[]) => unknown;

test("with a team, steps reach costmaxxing.dev at most once a minute, a failed send is retried, and the line shows the team", async () => {
  const hooks = new Map<string, Hook>();
  const posts: { url: string; user: string; ids: string[] }[] = [];
  let timers: { at: number; run: () => Promise<void> }[] = [];
  let time = NOW;
  let down = false;
  const $ = {
    session: { id: async () => "s9" },
    clock: { now: async () => time, after: (ms: number, run: () => Promise<void>) => void timers.push({ at: time + ms, run }) },
    store: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    http: {
      fetch: async (url: string, init: { body: string }) => {
        if (down) throw new TypeError("connection refused");
        const body = JSON.parse(init.body);
        posts.push({ url, user: body.user, ids: body.records.map((r: { id: string }) => r.id) });
        return { ok: true, status: 200, text: JSON.stringify({ counted: 0, days: 30, people: 3, requests: 40, price: 2000, alt: 250 }) };
      },
    },
    ui: {
      invalidate: () => {},
      resolve: () => ({ Box: (p: object) => ({ type: "Box", ...p }), Text: (p: object) => ({ type: "Text", ...p }) }),
    },
  };
  const advance = async (ms: number) => {
    time += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= time);
      if (due.length === 0) break;
      timers = timers.filter((t) => t.at > time);
      for (const t of due) await t.run();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  const step = async (e: { turnId: string; index: number; agentId?: string }) => {
    const next = async function* () {
      yield { kind: "text" };
      return { usage: USAGE };
    };
    const run = (hooks.get("turn.step") as unknown as (...a: unknown[]) => AsyncGenerator)($, e, next);
    let r = await run.next();
    while (r.done !== true) r = await run.next();
    await advance(0);
  };
  type Node = { children?: (Node | string)[] } | string;
  const text = (node: Node): string => (typeof node === "string" ? node : (node.children ?? []).map(text).join(""));
  const hint = async () => {
    const render = hooks.get("ui.render") as unknown as (...a: unknown[]) => Promise<{ children: Node[] }>;
    const tree = await render($, { props: { hint: "" } }, async () => "? for shortcuts");
    return text(tree.children[1] ?? "").trim();
  };

  register((event: string, a: unknown, b?: unknown) => void hooks.set(event, (b ?? a) as Hook), { team: " Acme-7KQ3X-m9pz2 ", user: "u1u1u1u1u1u1" });
  await (hooks.get("session.start") as unknown as (...a: unknown[]) => Promise<unknown>)($, {}, async (e: unknown) => e);
  await advance(0);
  assert.deepEqual(posts, [{ url: "https://costmaxxing.dev/api/teams/acme-7kq3x-m9pz2/usage", user: "u1u1u1u1u1u1", ids: [] }]);
  assert.match(await hint(), /– \$1\.8k \(team\) │ 3 people$/);

  await step({ turnId: "t1", index: 0 });
  await advance(1000);
  await step({ turnId: "t1", index: 1, agentId: "a7" });
  assert.equal(posts.length, 1);
  await advance(60_000);
  assert.deepEqual(posts.at(-1)?.ids, ["s9/t1/main/0", "s9/t1/a7/1"]);

  down = true;
  await step({ turnId: "t2", index: 0 });
  await advance(60_000);
  assert.match(await hint(), /team server unreachable$/);
  down = false;
  await step({ turnId: "t3", index: 0 });
  await advance(60_000);
  assert.deepEqual(posts.at(-1)?.ids, ["s9/t2/main/0", "s9/t3/main/0"]);
  assert.match(await hint(), /^costmaxxing {2}Current session: \$[\d.]+( ▲ \+\$[\d.]+)? │ Last 30 days: \$[\d.]+ \(you\) – \$1\.8k \(team\) │ 3 people$/);
});

test("the committed hooks module is the build of mod/src (run npm run build -w mod)", async () => {
  assert.equal(await readFile(OUTFILE, "utf8"), await bundle());
});
