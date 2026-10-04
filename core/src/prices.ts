import { obj, str, type Json } from "./json.ts";
import { promptTokens, type ModelPrice, type PriceBook, type Rates, type Tokens } from "./types.ts";

export const BOUNDLESS: ModelPrice[] = [
  { ref: "boundless/glm-5.3", name: "GLM-5.3", input: 1.12, cacheRead: 0.14, output: 3.52 },
  { ref: "boundless/glm-5.3-flash", name: "GLM-5.3 Flash", input: 0.12, cacheRead: 0.02, output: 0.4 },
  { ref: "boundless/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", input: 0.2, cacheRead: 0.01, output: 1 },
].map(({ ref, name, ...rates }) => ({
  ref,
  provider: "boundless",
  name,
  rates: { ...rates, cacheWrite: rates.input },
  tiers: [],
}));

function rates(cost: Json): Rates | undefined {
  const { input, output, cache_read, cache_write, cache_write_1h } = cost;
  if (typeof input !== "number" || typeof output !== "number") return undefined;
  const optional = (value: unknown) => (typeof value === "number" ? value : undefined);
  return {
    input,
    output,
    cacheRead: optional(cache_read),
    cacheWrite: optional(cache_write),
    cacheWrite1h: optional(cache_write_1h),
  };
}

function tiers(cost: Json): ModelPrice["tiers"] {
  const context = (Array.isArray(cost.tiers) ? cost.tiers : []).flatMap((entry: unknown) => {
    const tier = obj(obj(entry)?.tier);
    const tierRates = rates(obj(entry) ?? {});
    return tier?.type === "context" && typeof tier.size === "number" && tierRates
      ? [{ size: tier.size, rates: tierRates }]
      : [];
  });
  const over200k = rates(obj(cost.context_over_200k) ?? {});
  if (context.length === 0 && over200k) context.push({ size: 200_000, rates: over200k });
  return context.sort((a, b) => a.size - b.size);
}

export function parseModelsDev(data: unknown): ModelPrice[] {
  const prices: ModelPrice[] = [];
  for (const [provider, entry] of Object.entries(obj(data) ?? {})) {
    for (const [id, model] of Object.entries(obj(obj(entry)?.models) ?? {})) {
      const cost = obj(obj(model)?.cost);
      const base = cost && rates(cost);
      if (!cost || !base) continue;
      prices.push({
        ref: `${provider}/${id}`,
        provider,
        name: str(obj(model)?.name) ?? id,
        rates: base,
        tiers: tiers(cost),
      });
    }
  }
  return prices;
}

export function priceBook(catalog: ModelPrice[], overrides: Record<string, Partial<Rates>> = {}): PriceBook {
  const book = new Map([...BOUNDLESS, ...catalog].map((price) => [price.ref, price]));
  for (const [ref, override] of Object.entries(overrides)) {
    const slash = ref.indexOf("/");
    const merged = { ...book.get(ref)?.rates, ...override };
    if (slash < 1 || merged.input === undefined || merged.output === undefined) {
      throw new Error(`prices."${ref}" needs a provider/model key and input and output rates`);
    }
    book.set(ref, {
      ref,
      provider: ref.slice(0, slash),
      name: book.get(ref)?.name ?? ref.slice(slash + 1),
      rates: { ...merged, input: merged.input, output: merged.output },
      tiers: [],
    });
  }
  return book;
}

function candidates(model: string): string[] {
  const bare = model.replace(/\[1m\]$/, "");
  return [...new Set([model, bare, bare.replace(/-\d{8}$/, "")])];
}

export function findPrice(book: PriceBook, providers: readonly string[], model: string): ModelPrice | undefined {
  for (const provider of providers) {
    for (const id of candidates(model)) {
      const price = book.get(`${provider}/${id}`);
      if (price) return price;
    }
  }
  return undefined;
}

type Field = "cache_read" | "cache_write" | "cache_write_1h";

export interface Fallback {
  model: string;
  field: Field;
  rule: string;
}

interface Resolved {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  fallbacks: Fallback[];
}

function resolve(price: ModelPrice, r: Rates): Resolved {
  const fallbacks: Fallback[] = [];
  const pick = (value: number | undefined, field: Field, rule: string, fallback: number) => {
    if (value !== undefined) return value;
    fallbacks.push({ model: price.ref, field, rule });
    return fallback;
  };
  const cacheRead = pick(r.cacheRead, "cache_read", "input rate", r.input);
  const cacheWrite = pick(r.cacheWrite, "cache_write", "input rate", r.input);
  const cacheWrite1h =
    price.provider === "anthropic"
      ? pick(r.cacheWrite1h, "cache_write_1h", "2 × input rate", 2 * r.input)
      : pick(r.cacheWrite1h, "cache_write_1h", "cache write rate", cacheWrite);
  return { input: r.input, output: r.output, cacheRead, cacheWrite, cacheWrite1h, fallbacks };
}

const FIELD_TOKENS: Record<Field, keyof Tokens> = {
  cache_read: "cacheRead",
  cache_write: "write5m",
  cache_write_1h: "write1h",
};

export class Pricer {
  readonly fallbacks = new Map<string, Fallback>();
  private readonly resolved = new WeakMap<Rates, Resolved>();

  cost(price: ModelPrice, requests: number, t: Tokens): number {
    const prompt = promptTokens(t) / Math.max(1, requests);
    const rates = price.tiers.findLast((tier) => prompt > tier.size)?.rates ?? price.rates;
    let r = this.resolved.get(rates);
    if (!r) {
      r = resolve(price, rates);
      this.resolved.set(rates, r);
    }
    for (const fallback of r.fallbacks) {
      if (t[FIELD_TOKENS[fallback.field]] > 0) this.fallbacks.set(`${fallback.model} ${fallback.field}`, fallback);
    }
    return (
      (t.uncached * r.input +
        t.output * r.output +
        t.cacheRead * r.cacheRead +
        t.write5m * r.cacheWrite +
        t.write1h * r.cacheWrite1h) /
      1e6
    );
  }
}
