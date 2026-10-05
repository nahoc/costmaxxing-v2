import { book } from "./example.ts";

function model(ref: string) {
  const price = book.get(ref);
  if (!price) throw new Error(`no price for ${ref}`);
  return { ref, name: price.name, input: price.rates.input, output: price.rates.output, anthropic: price.provider === "anthropic" };
}

export const SWE_BENCH = {
  source: "Vals AI",
  url: "https://www.vals.ai/benchmarks/swebench",
  updated: "2026-09-01",
  harness: "mini-SWE-agent",
  rows: [
    { ...model("anthropic/claude-opus-5"), score: 97.0 },
    { ...model("boundless/glm-5.3"), score: 95.4 },
    { ...model("anthropic/claude-fable-5"), score: 95.0 },
    { ...model("boundless/glm-5.3-flash"), score: 92.0 },
  ],
};

export const PRICE_LADDER = [
  "anthropic/claude-fable-5-1",
  "anthropic/claude-opus-5-5",
  "anthropic/claude-sonnet-5",
  "boundless/glm-5.3",
  "boundless/deepseek-v4.1-flash",
  "boundless/glm-5.3-flash",
].map(model);
