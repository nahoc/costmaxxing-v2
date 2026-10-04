import assert from "node:assert/strict";
import { test } from "node:test";
import { findPrice, parseModelsDev, priceBook, Pricer, type ModelPrice, type Tokens } from "../src/index.ts";
import { MODELS_DEV } from "./fixtures.ts";

const book = priceBook(parseModelsDev(MODELS_DEV));
const tokens = (t: Partial<Tokens>): Tokens => ({ uncached: 0, output: 0, cacheRead: 0, write5m: 0, write1h: 0, ...t });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const get = (ref: string): ModelPrice => {
  const price = book.get(ref);
  assert.ok(price, `${ref} in book`);
  return price;
};

test("models.dev: skips models without input and output rates, keeps names and tiers", () => {
  assert.equal(book.get("deepinfra/no/price"), undefined);
  assert.equal(get("anthropic/claude-opus-5-5").name, "Claude Opus 5.5");
  assert.deepEqual(
    get("openai/gpt-6-sol").tiers.map((t) => t.size),
    [272000],
  );
  assert.deepEqual(
    get("deepinfra/big/model").tiers.map((t) => t.size),
    [200000],
  );
});

test("lookup: exact ID, then without [1m], then without a trailing date", () => {
  assert.equal(findPrice(book, ["anthropic"], "claude-opus-5-5[1m]")?.ref, "anthropic/claude-opus-5-5");
  assert.equal(findPrice(book, ["anthropic"], "claude-haiku-4-5-20251001")?.ref, "anthropic/claude-haiku-4-5");
  assert.equal(findPrice(book, ["anthropic", "openai"], "gpt-6-sol")?.ref, "openai/gpt-6-sol");
  assert.equal(findPrice(book, ["anthropic"], "gpt-6-sol"), undefined);
  const exact = priceBook(parseModelsDev(MODELS_DEV), {
    "anthropic/claude-haiku-4-5-20251001": { input: 9, output: 9 },
  });
  assert.equal(findPrice(exact, ["anthropic"], "claude-haiku-4-5-20251001")?.rates.input, 9);
});

test("cost: per-million formula with the Anthropic 1-hour write fallback", () => {
  const pricer = new Pricer();
  const usd = pricer.cost(
    get("anthropic/claude-opus-5-5"),
    1,
    tokens({ uncached: 1000, output: 2000, cacheRead: 100_000, write5m: 10_000, write1h: 5000 }),
  );
  near(usd, (1000 * 4 + 2000 * 20 + 100_000 * 0.2 + 10_000 * 5 + 5000 * 8) / 1e6);
  assert.deepEqual(
    [...pricer.fallbacks.values()],
    [{ model: "anthropic/claude-opus-5-5", field: "cache_write_1h", rule: "2 × input rate" }],
  );
});

test("cost: other providers fall back to input for writes and to the write rate for 1-hour writes", () => {
  const pricer = new Pricer();
  const usd = pricer.cost(
    get("togetherai/zai-org/GLM-5.3"),
    1,
    tokens({ uncached: 1000, output: 2000, cacheRead: 100_000, write5m: 10_000, write1h: 5000 }),
  );
  near(usd, (1000 * 1.4 + 2000 * 4.4 + 100_000 * 0.26 + 10_000 * 1.4 + 5000 * 1.4) / 1e6);
  assert.deepEqual(
    [...pricer.fallbacks.values()].map((f) => [f.field, f.rule]),
    [
      ["cache_write", "input rate"],
      ["cache_write_1h", "cache write rate"],
    ],
  );
});

test("cost: a fallback is only recorded when its tokens are used", () => {
  const pricer = new Pricer();
  near(pricer.cost(get("openai/gpt-6-luna"), 1, tokens({ uncached: 1e6, output: 1e6 })), 0.6);
  assert.equal(pricer.fallbacks.size, 0);
  near(pricer.cost(get("openai/gpt-6-luna"), 1, tokens({ cacheRead: 1e6 })), 0.1);
  assert.deepEqual(
    [...pricer.fallbacks.values()].map((f) => [f.model, f.field, f.rule]),
    [["openai/gpt-6-luna", "cache_read", "input rate"]],
  );
});

test("tiers: apply when a request's prompt exceeds the tier size", () => {
  const pricer = new Pricer();
  const sol = get("openai/gpt-6-sol");
  near(pricer.cost(sol, 1, tokens({ uncached: 300_000, output: 1000 })), (300_000 * 4 + 1000 * 15) / 1e6);
  near(pricer.cost(sol, 1, tokens({ uncached: 272_000, output: 1000 })), (272_000 * 2 + 1000 * 10) / 1e6);
  near(pricer.cost(sol, 1, tokens({ uncached: 200_000, cacheRead: 80_000 })), (200_000 * 4 + 80_000 * 0.4) / 1e6);
  const big = get("deepinfra/big/model");
  near(pricer.cost(big, 1, tokens({ uncached: 250_000 })), 0.5);
  near(pricer.cost(big, 1, tokens({ uncached: 150_000 })), 0.15);
});

test("aggregated rows: price the per-request average, then multiply by N", () => {
  const pricer = new Pricer();
  const big = get("deepinfra/big/model");
  near(pricer.cost(big, 2, tokens({ uncached: 500_000 })), 2 * ((250_000 * 2) / 1e6));
  near(pricer.cost(big, 4, tokens({ uncached: 500_000 })), 4 * ((125_000 * 1) / 1e6));
});

test("overrides merge into the catalog and need input and output for new models", () => {
  const custom = priceBook(parseModelsDev(MODELS_DEV), { "boundless/glm-5.3": { input: 1 } });
  assert.deepEqual(custom.get("boundless/glm-5.3")?.rates, { input: 1, output: 3.52, cacheRead: 0.14, cacheWrite: 1.12 });
  assert.throws(() => priceBook([], { "acme/new": { input: 1 } }), /input and output/);
  assert.throws(() => priceBook([], { "no-slash": { input: 1, output: 1 } }), /provider\/model/);
});
