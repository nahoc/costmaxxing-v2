// Built from mod/src by `npm run build -w mod`. Edit the source, not this file.

// ../core/src/format.ts
var compact = new Intl.NumberFormat("en-US", { notation: "compact" });
function count(n) {
  return compact.format(n).replace("K", "k");
}
function usd(n) {
  if (n < 0) return `-${usd(-n)}`;
  if (n < 0.5) return "<$1";
  return `$${count(n < 1e3 ? Math.round(n) : n)}`;
}
var cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function exactUsd(n) {
  return cents.format(n);
}

// ../core/src/json.ts
function obj(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function str(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}

// ../core/src/types.ts
function promptTokens(t) {
  return t.uncached + t.cacheRead + t.write5m + t.write1h;
}
function totalTokens(t) {
  return promptTokens(t) + t.output;
}

// ../core/src/prices.ts
var BOUNDLESS = [
  { ref: "boundless/glm-5.3", name: "GLM-5.3", input: 1.12, cacheRead: 0.14, output: 3.52 },
  { ref: "boundless/glm-5.3-flash", name: "GLM-5.3 Flash", input: 0.12, cacheRead: 0.02, output: 0.4 },
  { ref: "boundless/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", input: 0.2, cacheRead: 0.01, output: 1 }
].map(({ ref, name, ...rates2 }) => ({
  ref,
  provider: "boundless",
  name,
  rates: { ...rates2, cacheWrite: rates2.input },
  tiers: []
}));
function rates(cost) {
  const { input, output, cache_read, cache_write, cache_write_1h } = cost;
  if (typeof input !== "number" || typeof output !== "number") return void 0;
  const optional = (value) => typeof value === "number" ? value : void 0;
  return {
    input,
    output,
    cacheRead: optional(cache_read),
    cacheWrite: optional(cache_write),
    cacheWrite1h: optional(cache_write_1h)
  };
}
function tiers(cost) {
  const context = (Array.isArray(cost.tiers) ? cost.tiers : []).flatMap((entry) => {
    const tier = obj(obj(entry)?.tier);
    const tierRates = rates(obj(entry) ?? {});
    return tier?.type === "context" && typeof tier.size === "number" && tierRates ? [{ size: tier.size, rates: tierRates }] : [];
  });
  const over200k = rates(obj(cost.context_over_200k) ?? {});
  if (context.length === 0 && over200k) context.push({ size: 2e5, rates: over200k });
  return context.sort((a, b) => a.size - b.size);
}
function parseModelsDev(data) {
  const prices = [];
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
        tiers: tiers(cost)
      });
    }
  }
  return prices;
}
function priceBook(catalog2, overrides = {}) {
  const book2 = new Map([...BOUNDLESS, ...catalog2].map((price) => [price.ref, price]));
  for (const [ref, override] of Object.entries(overrides)) {
    const slash = ref.indexOf("/");
    const merged = { ...book2.get(ref)?.rates, ...override };
    if (slash < 1 || merged.input === void 0 || merged.output === void 0) {
      throw new Error(`prices."${ref}" needs a provider/model key and input and output rates`);
    }
    book2.set(ref, {
      ref,
      provider: ref.slice(0, slash),
      name: book2.get(ref)?.name ?? ref.slice(slash + 1),
      rates: { ...merged, input: merged.input, output: merged.output },
      tiers: []
    });
  }
  return book2;
}
function candidates(model) {
  const bare = model.replace(/\[1m\]$/, "");
  return [.../* @__PURE__ */ new Set([model, bare, bare.replace(/-\d{8}$/, "")])];
}
function findPrice(book2, providers, model) {
  for (const provider of providers) {
    for (const id of candidates(model)) {
      const price = book2.get(`${provider}/${id}`);
      if (price) return price;
    }
  }
  return void 0;
}
function resolve(price, r) {
  const fallbacks = [];
  const pick = (value, field, rule, fallback) => {
    if (value !== void 0) return value;
    fallbacks.push({ model: price.ref, field, rule });
    return fallback;
  };
  const cacheRead = pick(r.cacheRead, "cache_read", "input rate", r.input);
  const cacheWrite = pick(r.cacheWrite, "cache_write", "input rate", r.input);
  const cacheWrite1h = price.provider === "anthropic" ? pick(r.cacheWrite1h, "cache_write_1h", "2 \xD7 input rate", 2 * r.input) : pick(r.cacheWrite1h, "cache_write_1h", "cache write rate", cacheWrite);
  return { input: r.input, output: r.output, cacheRead, cacheWrite, cacheWrite1h, fallbacks };
}
var FIELD_TOKENS = {
  cache_read: "cacheRead",
  cache_write: "write5m",
  cache_write_1h: "write1h"
};
var Pricer = class {
  fallbacks = /* @__PURE__ */ new Map();
  resolved = /* @__PURE__ */ new WeakMap();
  cost(price, requests, t) {
    const prompt = promptTokens(t) / Math.max(1, requests);
    const rates2 = price.tiers.findLast((tier) => prompt > tier.size)?.rates ?? price.rates;
    let r = this.resolved.get(rates2);
    if (!r) {
      r = resolve(price, rates2);
      this.resolved.set(rates2, r);
    }
    for (const fallback of r.fallbacks) {
      if (t[FIELD_TOKENS[fallback.field]] > 0) this.fallbacks.set(`${fallback.model} ${fallback.field}`, fallback);
    }
    return (t.uncached * r.input + t.output * r.output + t.cacheRead * r.cacheRead + t.write5m * r.cacheWrite + t.write1h * r.cacheWrite1h) / 1e6;
  }
};

// ../core/src/scenarios.ts
var OPEN_WEIGHT_IDS = {
  frontier: "zai-org/GLM-5.3",
  mid: "zai-org/GLM-5.3-Flash",
  grunt: "deepseek-ai/DeepSeek-V4.1-Flash"
};
var PLAN_PROVIDERS = [
  {
    name: "Boundless",
    url: "https://inference.boundless.network",
    provider: "boundless",
    models: { frontier: "glm-5.3", mid: "glm-5.3-flash", grunt: "deepseek-v4.1-flash" }
  },
  { name: "Together AI", url: "https://www.together.ai", provider: "togetherai", models: OPEN_WEIGHT_IDS },
  { name: "Baseten", url: "https://www.baseten.co", provider: "baseten", models: OPEN_WEIGHT_IDS },
  {
    name: "Fireworks",
    url: "https://fireworks.ai",
    provider: "fireworks-ai",
    models: {
      frontier: "accounts/fireworks/models/glm-5p3",
      mid: "accounts/fireworks/models/glm-5p3-flash",
      grunt: "accounts/fireworks/models/deepseek-v4p1-flash"
    }
  }
];
var TIER_ROUTES = [
  ["claude-haiku-*", "grunt"],
  ["*-luna", "grunt"],
  ["claude-sonnet-*", "mid"],
  ["*-terra", "mid"],
  ["*", "frontier"]
];
var TIER_ROLES = [
  ["frontier", "hard tasks"],
  ["mid", "mid"],
  ["grunt", "grunt work"]
];
function planScenario(plan) {
  const ref = (tier) => `${plan.provider}/${plan.models[tier]}`;
  return {
    name: plan.name,
    url: plan.url,
    routes: TIER_ROUTES.map(([pattern, tier]) => [pattern, ref(tier)]),
    subagent: ref("grunt")
  };
}
function planDetail(plan, book2) {
  return TIER_ROLES.map(([tier, role]) => {
    const ref = `${plan.provider}/${plan.models[tier]}`;
    return `${book2.get(ref)?.name ?? plan.models[tier]} for ${role}`;
  }).join(" \xB7 ");
}
function modelScenario(ref, book2) {
  return { name: book2.get(ref)?.name ?? ref, routes: [["*", ref]] };
}
var globs = /* @__PURE__ */ new Map();
function glob(pattern) {
  let re = globs.get(pattern);
  if (!re) {
    const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
    re = new RegExp(`^${source}$`, "i");
    globs.set(pattern, re);
  }
  return re;
}
function route(scenario, model, subagent) {
  if (subagent && scenario.subagent) return scenario.subagent;
  const bare = model.replace(/\[1m\]$/, "");
  return scenario.routes.find(([pattern]) => glob(pattern).test(bare))?.[1];
}

// ../core/src/report.ts
var DAY = 864e5;
var SEAT_PRICES = {
  monthly: { premium: 125, standard: 25 },
  annual: { premium: 100, standard: 20 }
};
var SOURCE_PROVIDERS = {
  "Claude Code": ["anthropic", "openai"],
  Codex: ["openai", "anthropic"],
  "claude.ai": ["anthropic"]
};
function items(dataset) {
  if (dataset.kind === "spend") {
    return dataset.rows.map((row) => ({ ...row, subagent: false, providers: SOURCE_PROVIDERS["claude.ai"] }));
  }
  const since = dataset.now - dataset.days * DAY;
  return dataset.records.filter((record) => record.time >= since && record.time <= dataset.now).map((record) => ({ ...record, requests: record.requests ?? 1, providers: SOURCE_PROVIDERS[record.harness] }));
}
function sum(list, value) {
  let total = 0;
  for (const entry of list) total += value(entry);
  return total;
}
function totals(priced) {
  return { price: sum(priced, (p) => p.price), alt: sum(priced, (p) => p.alt) };
}
function table(priced, key) {
  const rows = /* @__PURE__ */ new Map();
  for (const p of priced) {
    const label = key(p);
    if (label === void 0) continue;
    const row = rows.get(label) ?? { label, requests: 0, tokens: 0, price: 0, alt: 0 };
    row.requests += p.item.requests;
    row.tokens += totalTokens(p.item.tokens);
    row.price += p.price;
    row.alt += p.alt;
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => b.price - a.price);
}
function pace(label, days, cost) {
  const per = (n) => ({ price: cost.price / days * n, alt: cost.alt / days * n });
  return { label, days, perDay: per(1), month: per(30), year: per(365) };
}
function inclusiveDays(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
}
function buildReport(options) {
  const { dataset, book: book2 } = options;
  const pricer = new Pricer();
  const unpriced = /* @__PURE__ */ new Map();
  const all = items(dataset);
  const missing = (scenario) => {
    const refs = scenario.routes.map(([, ref]) => ref);
    if (scenario.subagent) refs.push(scenario.subagent);
    return [...new Set(refs.filter((ref) => !book2.has(ref)))];
  };
  const costUnder = (scenario, p) => {
    const ref = route(scenario, p.item.model, p.item.subagent);
    const target = ref === void 0 ? void 0 : book2.get(ref);
    return target ? pricer.cost(target, p.item.requests, p.item.tokens) : p.price;
  };
  const [vsHero, ...vsRest] = options.vs ?? [];
  const plan = PLAN_PROVIDERS[0];
  const hero = options.hero ?? (vsHero ? modelScenario(vsHero, book2) : planScenario(plan));
  const custom = options.hero !== void 0 || vsHero !== void 0;
  const heroMissing = missing(hero);
  if (heroMissing.length > 0) throw new Error(`no price for ${heroMissing.join(", ")}`);
  const priced = [];
  for (const item of all) {
    const source = findPrice(book2, item.providers, item.model);
    if (!source) {
      unpriced.set(item.model, (unpriced.get(item.model) ?? 0) + item.requests);
      continue;
    }
    const price = pricer.cost(source, item.requests, item.tokens);
    const targetRef = route(hero, item.model, item.subagent);
    const target = targetRef === void 0 ? void 0 : book2.get(targetRef)?.name;
    priced.push({ item, label: source.name, price, alt: costUnder(hero, { item, price }), target });
  }
  const compare = (scenario) => {
    const absent = missing(scenario);
    const named = { name: scenario.name, ...scenario.url && { url: scenario.url } };
    if (absent.length > 0) {
      return { kind: "missing", ...named, models: absent.map((ref) => ref.slice(ref.indexOf("/") + 1)) };
    }
    const window2 = totals(priced);
    const alt = sum(priced, (p) => costUnder(scenario, p));
    const savings2 = window2.price - alt;
    return { kind: "priced", ...named, alt, savings: savings2, percent: window2.price > 0 ? savings2 / window2.price : 0 };
  };
  const bySavings = (list) => [
    ...list.flatMap((c) => c.kind === "priced" ? [c] : []).sort((a, b) => b.savings - a.savings),
    ...list.filter((c) => c.kind === "missing")
  ];
  let days;
  let forecast;
  if (dataset.kind === "spend") {
    days = inclusiveDays(dataset.from, dataset.to);
    forecast = [pace(`${days}-day average`, days, totals(priced))];
  } else {
    days = dataset.days;
    forecast = [.../* @__PURE__ */ new Set([Math.min(7, days), days])].map((window2) => {
      const since = dataset.now - window2 * DAY;
      return pace(`${window2}-day average`, window2, totals(priced.filter((p) => (p.item.time ?? 0) >= since)));
    });
  }
  const window = totals(priced);
  const pacing = forecast.at(-1);
  const harnesses = dataset.kind === "logs" ? options.plan?.harnesses : void 0;
  const covered = harnesses ? priced.filter((p) => p.item.harness && harnesses.includes(p.item.harness)) : priced;
  const worth = sum(covered, (p) => p.price) / days * 30;
  let seats;
  if (options.plan) {
    seats = { kind: "plan", name: options.plan.name, monthly: options.plan.monthlyUsd, worth };
  } else if (dataset.kind === "spend") {
    const count2 = options.seats ?? estimateSeats(dataset.rows);
    const rate = SEAT_PRICES[options.billing ?? "monthly"];
    seats = {
      kind: "seats",
      premium: count2.premium,
      standard: count2.standard,
      estimated: !options.seats,
      monthly: count2.premium * rate.premium + count2.standard * rate.standard,
      worth
    };
  }
  const users = new Set(all.flatMap((item) => item.user || []));
  const sessions = new Set(all.flatMap((item) => item.session || []));
  const byUser = users.size > 0 ? table(priced, (p) => p.item.user || "(no email)") : void 0;
  if (byUser && dataset.kind === "spend") {
    const estimate = estimateSeats(dataset.rows).byUser ?? {};
    const rate = SEAT_PRICES[options.billing ?? "monthly"];
    for (const row of byUser) {
      const seat = options.seats?.byUser?.[row.label.toLowerCase()] ?? estimate[row.label];
      if (!seat) continue;
      row.seat = seat;
      row.overSeat = row.price / days * 30 / rate[seat];
    }
  }
  const models = table(priced, (p) => p.label);
  for (const row of models) {
    const targets = [...new Set(priced.flatMap((p) => p.label === row.label && p.target ? [p.target] : []))];
    if (targets.length > 0) row.replacement = targets.join(" / ");
  }
  return {
    kind: dataset.kind,
    recent: dataset.kind === "logs" || dataset.recent === true,
    scope: dataset.kind === "spend" ? `${dataset.from} to ${dataset.to}` : `last ${days} days`,
    org: dataset.kind === "spend" ? dataset.org : void 0,
    days,
    sessions: dataset.kind === "logs" ? sessions.size : void 0,
    users: users.size > 0 ? users.size : void 0,
    requests: sum(all, (item) => item.requests),
    tokens: sum(all, (item) => totalTokens(item.tokens)),
    hero: {
      name: custom ? hero.name : "open-weight models",
      detail: custom ? void 0 : planDetail(plan, book2),
      ...window,
      month: pacing.month.price - pacing.month.alt,
      year: pacing.year.price - pacing.year.alt,
      percent: window.price > 0 ? (window.price - window.alt) / window.price : 0
    },
    seats,
    byHarness: dataset.kind === "logs" ? table(priced, (p) => p.item.harness) : void 0,
    byUser,
    byProduct: dataset.kind === "spend" ? table(priced, (p) => p.item.product) : void 0,
    models,
    forecast,
    providers: bySavings(PLAN_PROVIDERS.map((provider) => compare(planScenario(provider)))),
    scenarios: bySavings([...vsRest.map((ref) => modelScenario(ref, book2)), ...options.scenarios ?? []].map(compare)),
    unpriced: [...unpriced].map(([model, requests]) => ({ model, requests })).sort((a, b) => b.requests - a.requests),
    fallbacks: [...pricer.fallbacks.values()]
  };
}
function estimateSeats(rows) {
  const everyone = new Set(rows.map((row) => row.user).filter((user) => user !== ""));
  const premium = new Set(rows.filter((row) => everyone.has(row.user) && /fable/i.test(row.model)).map((row) => row.user));
  const byUser = Object.fromEntries([...everyone].map((user) => [user, premium.has(user) ? "premium" : "standard"]));
  return { premium: premium.size, standard: everyone.size - premium.size, byUser };
}

// ../core/data/models-dev-snapshot.json
var models_dev_snapshot_default = { anthropic: { models: { "claude-haiku-4-5": { name: "Claude Haiku 4.5 (latest)", open_weights: false, cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 } }, "claude-opus-4-5": { name: "Claude Opus 4.5 (latest)", open_weights: false, cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } }, "claude-sonnet-4-5": { name: "Claude Sonnet 4.5 (latest)", open_weights: false, cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } }, "claude-opus-5-5": { name: "Claude Opus 5.5", open_weights: false, cost: { input: 4, output: 20, cache_read: 0.2, cache_write: 5 } }, "claude-fable-5-1": { name: "Claude Fable 5.1", open_weights: false, cost: { input: 10, output: 50, cache_read: 0.25, cache_write: 12.5 } }, "claude-opus-4-5-20251101": { name: "Claude Opus 4.5", open_weights: false, cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } }, "claude-opus-5": { name: "Claude Opus 5", open_weights: false, cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } }, "claude-fable-5": { name: "Claude Fable 5", open_weights: false, cost: { input: 10, output: 50, cache_read: 1, cache_write: 12.5 } }, "claude-opus-4-8": { name: "Claude Opus 4.8", open_weights: false, cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } }, "claude-sonnet-4-5-20250929": { name: "Claude Sonnet 4.5", open_weights: false, cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } }, "claude-sonnet-5": { name: "Claude Sonnet 5", open_weights: false, cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 } }, "claude-opus-4-6": { name: "Claude Opus 4.6", open_weights: false, cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } }, "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5", open_weights: false, cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 } }, "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", open_weights: false, cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } }, "claude-sonnet-5-5": { name: "Claude Sonnet 5.5", open_weights: false, cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 } }, "claude-opus-4-7": { name: "Claude Opus 4.7", open_weights: false, cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } } } }, openai: { models: { "gpt-5.4": { name: "GPT-5.4", open_weights: false, cost: { input: 2.5, output: 15, cache_read: 0.25, tiers: [{ input: 5, output: 22.5, cache_read: 0.5, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 } } }, "gpt-5.4-pro": { name: "GPT-5.4 Pro", open_weights: false, cost: { input: 30, output: 180, tiers: [{ input: 60, output: 270, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 60, output: 270 } } }, "gpt-3.5-turbo": { name: "GPT-3.5-turbo", open_weights: false, cost: { input: 0.5, output: 1.5, cache_read: 0 } }, "gpt-5.5-pro": { name: "GPT-5.5 Pro", open_weights: false, cost: { input: 30, output: 180, tiers: [{ input: 60, output: 270, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 60, output: 270 } } }, "text-embedding-3-small": { name: "text-embedding-3-small", open_weights: false, cost: { input: 0.02, output: 0 } }, "gpt-5.4-nano": { name: "GPT-5.4 nano", open_weights: false, cost: { input: 0.2, output: 1.25, cache_read: 0.02 } }, "gpt-realtime-2.1": { name: "GPT-Realtime-2.1", open_weights: false, cost: { input: 4, output: 24, cache_read: 0.4, input_audio: 32, output_audio: 64 } }, "gpt-4o-2024-05-13": { name: "GPT-4o (2024-05-13)", open_weights: false, cost: { input: 5, output: 15 } }, "gpt-4o": { name: "GPT-4o", open_weights: false, cost: { input: 2.5, output: 10, cache_read: 1.25 } }, "gpt-5-mini": { name: "GPT-5 Mini", open_weights: false, cost: { input: 0.25, output: 2, cache_read: 0.025 } }, "gpt-image-2": { name: "gpt-image-2", open_weights: false, cost: { input: 5, output: 30, cache_read: 1.25 } }, "gpt-5.2-pro": { name: "GPT-5.2 Pro", open_weights: false, cost: { input: 21, output: 168 } }, "o4-mini": { name: "o4-mini", open_weights: false, cost: { input: 1.1, output: 4.4, cache_read: 0.275 } }, "o3-mini": { name: "o3-mini", open_weights: false, cost: { input: 1.1, output: 4.4, cache_read: 0.55 } }, "text-embedding-ada-002": { name: "text-embedding-ada-002", open_weights: false, cost: { input: 0.1, output: 0 } }, "gpt-4": { name: "GPT-4", open_weights: false, cost: { input: 30, output: 60 } }, "gpt-5.3-codex": { name: "GPT-5.3 Codex", open_weights: false, cost: { input: 1.75, output: 14, cache_read: 0.175 } }, "gpt-4.1-nano": { name: "GPT-4.1 nano", open_weights: false, cost: { input: 0.1, output: 0.4, cache_read: 0.025 } }, "gpt-5-nano": { name: "GPT-5 Nano", open_weights: false, cost: { input: 0.05, output: 0.4, cache_read: 5e-3 } }, "gpt-5.6": { name: "GPT-5.6", open_weights: false, cost: { input: 4, output: 20, cache_read: 0.4, cache_write: 5, tiers: [{ input: 8, output: 30, cache_read: 0.8, cache_write: 10, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 8, output: 30, cache_read: 0.8, cache_write: 10 } } }, "gpt-5.2-chat-latest": { name: "GPT-5.2 Chat", open_weights: false, cost: { input: 1.75, output: 14, cache_read: 0.175 } }, o1: { name: "o1", open_weights: false, cost: { input: 15, output: 60, cache_read: 7.5 } }, "gpt-5-pro": { name: "GPT-5 Pro", open_weights: false, cost: { input: 15, output: 120 } }, "gpt-5.3-codex-spark": { name: "GPT-5.3 Codex Spark", open_weights: false, cost: { input: 1.75, output: 14, cache_read: 0.175 } }, "gpt-6.1-sol": { name: "GPT-6.1 Sol", open_weights: false, cost: { input: 2, output: 10, cache_read: 0.1, cache_write: 2.5, tiers: [{ input: 4, output: 15, cache_read: 0.2, cache_write: 5, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 4, output: 15, cache_read: 0.2, cache_write: 5 } } }, "text-embedding-3-large": { name: "text-embedding-3-large", open_weights: false, cost: { input: 0.13, output: 0 } }, "gpt-4o-2024-08-06": { name: "GPT-4o (2024-08-06)", open_weights: false, cost: { input: 2.5, output: 10, cache_read: 1.25 } }, "gpt-6-astra": { name: "GPT-6 Astra", open_weights: false, cost: { input: 10, output: 50, cache_read: 1, cache_write: 12.5, tiers: [{ input: 20, output: 75, cache_read: 2, cache_write: 25, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 20, output: 75, cache_read: 2, cache_write: 25 } } }, "gpt-5.1": { name: "GPT-5.1", open_weights: false, cost: { input: 1.25, output: 10, cache_read: 0.125 } }, "gpt-4o-mini": { name: "GPT-4o mini", open_weights: false, cost: { input: 0.15, output: 0.6, cache_read: 0.075 } }, "o3-pro": { name: "o3-pro", open_weights: false, cost: { input: 20, output: 80 } }, "gpt-daybreak-blue-latest": { name: "Daybreak Blue", open_weights: false, cost: { input: 4, output: 20, cache_read: 0.4, cache_write: 5, tiers: [{ input: 8, output: 30, cache_read: 0.8, cache_write: 10, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 8, output: 30, cache_read: 0.8, cache_write: 10 } } }, "gpt-5.4-mini": { name: "GPT-5.4 mini", open_weights: false, cost: { input: 0.75, output: 4.5, cache_read: 0.075 } }, "gpt-5.6-luna": { name: "GPT-5.6 Luna", open_weights: false, cost: { input: 0.2, output: 1.2, cache_read: 0.02, cache_write: 0.25, tiers: [{ input: 0.4, output: 1.8, cache_read: 0.04, cache_write: 0.5, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 0.4, output: 1.8, cache_read: 0.04, cache_write: 0.5 } } }, "gpt-5.2": { name: "GPT-5.2", open_weights: false, cost: { input: 1.75, output: 14, cache_read: 0.175 } }, "gpt-5.5": { name: "GPT-5.5", open_weights: false, cost: { input: 5, output: 30, cache_read: 0.5, tiers: [{ input: 10, output: 45, cache_read: 1, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 10, output: 45, cache_read: 1 } } }, "gpt-4.1": { name: "GPT-4.1", open_weights: false, cost: { input: 2, output: 8, cache_read: 0.5 } }, "gpt-4o-2024-11-20": { name: "GPT-4o (2024-11-20)", open_weights: false, cost: { input: 2.5, output: 10, cache_read: 1.25 } }, "gpt-4.1-mini": { name: "GPT-4.1 mini", open_weights: false, cost: { input: 0.4, output: 1.6, cache_read: 0.1 } }, "gpt-6-luna": { name: "GPT-6 Luna", open_weights: false, cost: { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125, tiers: [{ input: 0.2, output: 0.75, cache_read: 0.02, cache_write: 0.25, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 0.2, output: 0.75, cache_read: 0.02, cache_write: 0.25 } } }, "gpt-5.3-chat-latest": { name: "GPT-5.3 Chat (latest)", open_weights: false, cost: { input: 1.75, output: 14, cache_read: 0.175 } }, "gpt-5.6-terra": { name: "GPT-5.6 Terra", open_weights: false, cost: { input: 2, output: 12, cache_read: 0.2, cache_write: 2.5, tiers: [{ input: 4, output: 18, cache_read: 0.4, cache_write: 5, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 4, output: 18, cache_read: 0.4, cache_write: 5 } } }, "gpt-4-turbo": { name: "GPT-4 Turbo", open_weights: false, cost: { input: 10, output: 30 } }, "gpt-daybreak-red-latest": { name: "Daybreak Red", open_weights: false, cost: { input: 12.5, output: 75, cache_read: 1.25, cache_write: 15.625 } }, o3: { name: "o3", open_weights: false, cost: { input: 2, output: 8, cache_read: 0.5 } }, "gpt-5": { name: "GPT-5", open_weights: false, cost: { input: 1.25, output: 10, cache_read: 0.125 } }, "gpt-5.6-sol": { name: "GPT-5.6 Sol", open_weights: false, cost: { input: 4, output: 20, cache_read: 0.4, cache_write: 5, tiers: [{ input: 8, output: 30, cache_read: 0.8, cache_write: 10, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 8, output: 30, cache_read: 0.8, cache_write: 10 } } }, "gpt-6-sol": { name: "GPT-6 Sol", open_weights: false, cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5, tiers: [{ input: 4, output: 15, cache_read: 0.4, cache_write: 5, tier: { type: "context", size: 272e3 } }], context_over_200k: { input: 4, output: 15, cache_read: 0.4, cache_write: 5 } } }, "o1-pro": { name: "o1-pro", open_weights: false, cost: { input: 150, output: 600 } } } }, togetherai: { models: { "meta-llama/Llama-3.3-70B-Instruct-Turbo": { name: "Llama 3.3 70B", open_weights: true, cost: { input: 1.04, output: 1.04 } }, "thinkingmachines/Inkling": { name: "Inkling", open_weights: true, cost: { input: 1, output: 4.05, cache_read: 0.17 } }, "essentialai/Rnj-1-Instruct": { name: "Rnj-1 Instruct", open_weights: true, cost: { input: 0.15, output: 0.15 } }, "Qwen/Qwen3.7-Max": { name: "Qwen3.7 Max", open_weights: false, cost: { input: 1.25, output: 3.75, cache_read: 0.125 } }, "Qwen/Qwen2.5-7B-Instruct-Turbo": { name: "Qwen 2.5 7B Instruct Turbo", open_weights: true, cost: { input: 0.3, output: 0.3 } }, "Qwen/Qwen3-Coder-Next-FP8": { name: "Qwen3 Coder Next FP8", open_weights: true, cost: { input: 0.5, output: 1.2 } }, "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": { name: "Qwen3 235B A22B Instruct 2507 FP8", open_weights: true, cost: { input: 0.2, output: 0.6 } }, "Qwen/Qwen3.5-9B": { name: "Qwen3.5 9B", open_weights: true, cost: { input: 0.17, output: 0.25 } }, "Qwen/Qwen3.5-397B-A17B": { name: "Qwen3.5 397B A17B", open_weights: true, cost: { input: 0.6, output: 3.6, cache_read: 0.35 } }, "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8": { name: "Qwen3 Coder 480B A35B Instruct", open_weights: true, cost: { input: 2, output: 2 } }, "Qwen/Qwen3.6-Plus": { name: "Qwen3.6 Plus", open_weights: true, cost: { input: 0.5, output: 3 } }, "LiquidAI/LFM2-24B-A2B": { name: "LFM2-24B-A2B", open_weights: true, cost: { input: 0.03, output: 0.12 } }, "deepseek-ai/DeepSeek-V4-Flash-0731": { name: "DeepSeek V4 Flash 0731", open_weights: true, cost: { input: 0.14, output: 0.28, cache_read: 0.03 } }, "deepseek-ai/DeepSeek-R1": { name: "DeepSeek-R1", open_weights: true, cost: { input: 3, output: 7 } }, "deepseek-ai/DeepSeek-V4-Pro-0813": { name: "DeepSeek V4 Pro 0813", open_weights: true, cost: { input: 1.32, output: 3.96, cache_read: 0.13 } }, "deepseek-ai/DeepSeek-V4.1-Flash": { name: "DeepSeek V4.1 Flash", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 6e-3 } }, "deepseek-ai/DeepSeek-V3-1": { name: "DeepSeek V3.1", open_weights: true, cost: { input: 0.6, output: 1.7 } }, "deepseek-ai/DeepSeek-V3": { name: "DeepSeek-V3", open_weights: true, cost: { input: 1.25, output: 1.25 } }, "MiniMaxAI/MiniMax-M3": { name: "MiniMax-M3", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 0.06 } }, "MiniMaxAI/MiniMax-M2.5": { name: "MiniMax-M2.5", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 0.06 } }, "MiniMaxAI/MiniMax-M2.7": { name: "MiniMax-M2.7", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 0.06 } }, "moonshotai/Kimi-K3": { name: "Kimi K3", open_weights: true, cost: { input: 3, output: 15, cache_read: 0.3 } }, "zai-org/GLM-5.1": { name: "GLM-5.1", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.26 } }, "zai-org/GLM-5.2": { name: "GLM-5.2", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.26 } }, "zai-org/GLM-5": { name: "GLM-5", open_weights: true, cost: { input: 1, output: 3.2 } }, "zai-org/GLM-5.3-Flash": { name: "GLM-5.3-Flash", open_weights: true, cost: { input: 0.15, output: 0.5, cache_read: 0.03 } }, "zai-org/GLM-5.3": { name: "GLM-5.3", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.26 } }, "nvidia/nemotron-3-ultra-550b-a55b": { name: "Nemotron 3 Ultra 550B A55B", open_weights: true, cost: { input: 0.6, output: 3.6, cache_read: 0.2 } }, "openai/gpt-oss-120b": { name: "GPT OSS 120B", open_weights: true, cost: { input: 0.15, output: 0.6 } } } }, baseten: { models: { "thinkingmachines/inkling-small": { name: "Inkling Small", open_weights: true, cost: { input: 0.5, output: 1.2, cache_read: 0.1 } }, "thinkingmachines/inkling": { name: "Inkling", open_weights: true, cost: { input: 1, output: 4.05 } }, "deepseek-ai/DeepSeek-V3.1": { name: "DeepSeek V3.1", open_weights: true, cost: { input: 0.5, output: 1.5 } }, "deepseek-ai/DeepSeek-V4-Flash-0731": { name: "DeepSeek V4 Flash 0731", open_weights: true, cost: { input: 0.13, output: 0.26, cache_read: 0.028 } }, "deepseek-ai/DeepSeek-V4-Pro-0813": { name: "DeepSeek V4 Pro 0813", open_weights: true, cost: { input: 1.32, output: 3.96 } }, "deepseek-ai/DeepSeek-V4.1-Flash": { name: "DeepSeek V4.1 Flash", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 0.03 } }, "deepseek-ai/DeepSeek-V4.1-Flash-Fast": { name: "deepseek-ai/DeepSeek-V4.1-Flash-Fast", open_weights: true, cost: { input: 0.6, output: 2.4 } }, "deepseek-ai/DeepSeek-V4-Pro": { name: "DeepSeek V4 Pro", open_weights: true, cost: { input: 1.74, output: 3.48, cache_read: 0.145 } }, "MiniMaxAI/MiniMax-M2.5": { name: "MiniMax-M2.5", open_weights: true, cost: { input: 0.3, output: 1.2 } }, "moonshotai/Kimi-K2.6": { name: "Kimi K2.6", open_weights: true, cost: { input: 0.95, output: 4, cache_read: 0.16 } }, "moonshotai/Kimi-K3": { name: "Kimi K3", open_weights: true, cost: { input: 3, output: 15 } }, "moonshotai/Kimi-K2.7-Code": { name: "Kimi K2.7 Code", open_weights: true, cost: { input: 0.95, output: 4, cache_read: 0.16 } }, "moonshotai/Kimi-K2.5": { name: "Kimi K2.5", open_weights: true, cost: { input: 0.6, output: 3, cache_read: 0.12 } }, "zai-org/GLM-5.1": { name: "GLM 5.1", open_weights: true, cost: { input: 1.3, output: 4.3, cache_read: 0.26 } }, "zai-org/GLM-5.2": { name: "GLM 5.2", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.3 } }, "zai-org/GLM-4.7": { name: "GLM 4.7", open_weights: true, cost: { input: 0.6, output: 2.2, cache_read: 0.12 } }, "zai-org/GLM-5.2-Fast": { name: "GLM 5.2 Fast", open_weights: true, cost: { input: 2.1, output: 6.6, cache_read: 0.21 } }, "zai-org/GLM-5.3-Fast": { name: "GLM 5.3 Fast", open_weights: true, cost: { input: 2.1, output: 6.6 } }, "zai-org/GLM-5": { name: "GLM 5", open_weights: true, cost: { input: 0.95, output: 3.15, cache_read: 0.2 } }, "zai-org/GLM-5.3-Flash": { name: "GLM 5.3 Flash", open_weights: true, cost: { input: 0.15, output: 0.5 } }, "zai-org/GLM-5.3": { name: "GLM 5.3", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.14 } }, "nvidia/Nemotron-120B-A12B": { name: "Nemotron Super", open_weights: true, cost: { input: 0.3, output: 0.75, cache_read: 0.06 } }, "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B": { name: "Nemotron Ultra", open_weights: true, cost: { input: 0.6, output: 2.4, cache_read: 0.12 } }, "openai/gpt-oss-120b": { name: "OpenAI GPT 120B", open_weights: true, cost: { input: 0.1, output: 0.5 } } } }, "fireworks-ai": { models: { "accounts/fireworks/models/nemotron-3-ultra-nvfp4": { name: "Nemotron 3 Ultra 550B A55B", open_weights: true, cost: { input: 0.6, output: 2.4, cache_read: 0.12 } }, "accounts/fireworks/models/kimi-k3": { name: "Kimi K3", open_weights: true, cost: { input: 3, output: 15, cache_read: 0.3 } }, "accounts/fireworks/models/qwen3p8-2p4t-a95b": { name: "Qwen3.8 2.4T A95B", open_weights: true, cost: { input: 2, output: 6, cache_read: 0.25 } }, "accounts/fireworks/models/ember-1": { name: "Ember-1", open_weights: false, cost: { input: 3, output: 15, cache_read: 0.3 } }, "accounts/fireworks/models/deepseek-v4p1-flash": { name: "DeepSeek V4.1 Flash", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 6e-3 } }, "accounts/fireworks/models/glm-5p3": { name: "GLM 5.3", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.26 } }, "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": { name: "Nemotron 3.5 Lightning 30B A3B", open_weights: true, cost: { input: 0.05, output: 0.2, cache_read: 0.01 } }, "accounts/fireworks/models/inkling": { name: "Inkling", open_weights: true, cost: { input: 1, output: 4.05, cache_read: 0.17 } }, "accounts/fireworks/models/minimax-m3": { name: "MiniMax-M3", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 0.06 } }, "accounts/fireworks/models/glm-5p3-flash": { name: "GLM 5.3 Flash", open_weights: true, cost: { input: 0.15, output: 0.5, cache_read: 0.03 } }, "accounts/fireworks/models/gpt-oss-120b": { name: "GPT OSS 120B", open_weights: true, cost: { input: 0.15, output: 0.6, cache_read: 0.015 } }, "accounts/fireworks/models/qwen3p8-max": { name: "Qwen3.8 Max", open_weights: false, cost: { input: 2, output: 6, cache_read: 0.25 } }, "accounts/fireworks/routers/minimax-latest": { name: "MiniMax Latest", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 0.06 } }, "accounts/fireworks/routers/glm-flash-latest": { name: "GLM Flash Latest (GLM 5.3 Flash)", open_weights: true, cost: { input: 0.15, output: 0.5, cache_read: 0.03 } }, "accounts/fireworks/routers/glm-fast-latest": { name: "GLM 5.3 Fast (Latest)", open_weights: true, cost: { input: 2.1, output: 6.6, cache_read: 0.39 } }, "accounts/fireworks/routers/kimi-k3-fast": { name: "Kimi K3 Fast", open_weights: true, cost: { input: 4.5, output: 22.5, cache_read: 0.45 } }, "accounts/fireworks/routers/glm-5p3-fast": { name: "GLM 5.3 Fast", open_weights: true, cost: { input: 2.1, output: 6.6, cache_read: 0.39 } }, "accounts/fireworks/routers/kimi-fast-latest": { name: "Kimi Fast Latest", open_weights: true, cost: { input: 4.5, output: 22.5, cache_read: 0.45 } }, "accounts/fireworks/routers/qwen-max-latest": { name: "Qwen Max Latest (Qwen3.8 Max)", open_weights: false, cost: { input: 2, output: 6, cache_read: 0.25 } }, "accounts/fireworks/routers/kimi-latest": { name: "Kimi Latest", open_weights: true, cost: { input: 3, output: 15, cache_read: 0.3 } }, "accounts/fireworks/routers/deepseek-flash-latest": { name: "DeepSeek Flash Latest", open_weights: true, cost: { input: 0.3, output: 1.2, cache_read: 6e-3 } }, "accounts/fireworks/routers/glm-latest": { name: "GLM Latest", open_weights: true, cost: { input: 1.4, output: 4.4, cache_read: 0.26 } } } }, morph: { models: { "morph-v3-large": { name: "Morph v3 Large", open_weights: false, cost: { input: 0.9, output: 1.9 } }, "morph-v3-fast": { name: "Morph v3 Fast", open_weights: false, cost: { input: 0.8, output: 1.2 } }, auto: { name: "Auto", open_weights: false, cost: { input: 0.85, output: 1.55 } } } } };

// src/meter.ts
var NONE = { requests: 0, price: 0, alt: 0 };
function add(a, b) {
  return { requests: a.requests + b.requests, price: a.price + b.price, alt: a.alt + b.alt };
}
var finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : 0;
function asTally(value) {
  const v = value ?? {};
  return { requests: finite(v.requests), price: finite(v.price), alt: finite(v.alt) };
}
function asTeam(text) {
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return void 0;
  }
  if (typeof v?.price !== "number" || typeof v.alt !== "number") return void 0;
  return { ...asTally(v), days: finite(v.days), people: finite(v.people) };
}
function stepRecord(usage, step) {
  return {
    ...step,
    harness: "Claude Code",
    model: usage.model,
    tokens: {
      uncached: finite(usage.input_tokens),
      output: finite(usage.output_tokens),
      cacheRead: finite(usage.cache_read_input_tokens),
      write5m: finite(usage.cache_creation_input_tokens),
      write1h: 0
    }
  };
}
function priceRecord(record, book2, scenario) {
  const { hero } = buildReport({ dataset: { kind: "logs", records: [record], days: 1, now: record.time }, book: book2, ...scenario && { hero: scenario } });
  return { requests: 1, price: hero.price, alt: hero.alt };
}
function localDay(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function savings(t) {
  const n = t.price - t.alt;
  return Math.abs(n) < 100 ? exactUsd(n) : usd(n);
}
function statusParts(session2, month2, team2, gain2 = 0) {
  const parts = [["costmaxxing", "brand"], ["  Potential savings via open-weight: ", "label"], [savings(session2), "amount"]];
  if (gain2 > 0) parts.push([` \u25B2 +${exactUsd(gain2)}`, "gain"]);
  parts.push([" this session", "label"], [" \u2502 ", "divider"], [savings(month2), "amount"], [" last 30 days (you)", "label"]);
  if (team2 === "unreachable") parts.push([" \u2502 ", "divider"], ["team server unreachable", "warn"]);
  else if (team2 === "missing") parts.push([" \u2502 ", "divider"], ["team ID not found", "warn"]);
  else if (team2) {
    parts.push([" \xB7 ", "label"], [savings(team2), "amount"], [" (team)", "label"]);
    parts.push([" \u2502 ", "divider"], [`${count(team2.people)} ${team2.people === 1 ? "person" : "people"}`, "label"]);
  }
  return parts;
}

// src/register.ts
var catalog = parseModelsDev(models_dev_snapshot_default);
var book = priceBook(catalog);
var pricing;
function usePricing(next) {
  pricing = next ?? void 0;
  book = priceBook(catalog, pricing?.prices ?? {});
}
var DAY2 = 864e5;
var KEY = /^(\d{4}-\d{2}-\d{2}) (.+)$/;
var HOSTED = "https://costmaxxing.dev";
var GAP = 6e4;
var team = { name: "", option: "", server: "", token: "", user: "" };
var lastSent = 0;
var waiting = false;
var sessionId = "";
var session = NONE;
var month = NONE;
var totals2;
var unsaved = /* @__PURE__ */ new Map();
var pending = [];
var queue = Promise.resolve();
var gain = { amount: 0, until: 0 };
var TONES = {
  brand: { bold: true, color: "#8d71d6" },
  amount: { bold: true, color: "success" },
  label: { dimColor: true },
  divider: { color: "#8d71d6" },
  gain: { color: "success" },
  warn: { color: "warning" }
};
async function load($) {
  sessionId = await $.session.id();
  const oldest = localDay(await $.clock.now() - 29 * DAY2);
  let ours = NONE;
  let all = NONE;
  for (const key of await $.store.keys()) {
    const match = KEY.exec(key);
    if (!match) continue;
    if ((match[1] ?? "") < oldest) {
      await $.store.delete(key);
      continue;
    }
    const tally = asTally(await $.store.get(key));
    all = add(all, tally);
    if (match[2] === sessionId) ours = add(ours, tally);
  }
  session = ours;
  month = all;
  usePricing(await $.store.get("pricing") ?? void 0);
  const moved = await $.store.get("team-moved");
  if (team.option && moved?.from === team.option && moved.to) team.name = moved.to;
  $.ui.invalidate("ui.render");
}
var reporting = () => team.name !== "" || team.server !== "" && team.token !== "";
async function flush($, force) {
  const days = unsaved;
  unsaved = /* @__PURE__ */ new Map();
  for (const [key, tally] of days) await $.store.set(key, add(asTally(await $.store.get(key)), tally));
  if (!reporting()) return;
  const now = await $.clock.now();
  if (!force && now - lastSent < GAP) {
    if (!waiting) {
      waiting = true;
      $.clock.after(GAP - (now - lastSent), async () => {
        waiting = false;
        save($, false);
      });
    }
    return;
  }
  lastSent = now;
  if (team.name && !team.user) {
    team.user = String(await $.store.get("user") ?? "");
    if (!team.user) {
      team.user = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await $.store.set("user", team.user);
    }
  }
  const records = pending.splice(0);
  try {
    const response = team.name ? await $.http.fetch(`${team.server || HOSTED}/api/teams/${team.name}/usage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: team.user, records })
    }) : await $.http.fetch(`${team.server}/costmaxxing/usage`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-costmaxxing-token": team.token, "x-costmaxxing-user": team.user || "unknown" },
      body: JSON.stringify({ records })
    });
    if (response.status === 410 && team.name) {
      const moved = JSON.parse(response.text).moved;
      if (moved) {
        await $.store.set("team-moved", { from: team.option, to: moved });
        team.name = moved;
        pending = [...records, ...pending].slice(-5e3);
        lastSent = 0;
        save($, true);
        return;
      }
    }
    totals2 = response.status === 404 ? "missing" : response.ok && asTeam(response.text) || "unreachable";
    if (response.ok && team.name) {
      const sentPricing = JSON.parse(response.text).pricing ?? void 0;
      if (JSON.stringify(sentPricing) !== JSON.stringify(pricing)) {
        usePricing(sentPricing);
        await $.store.set("pricing", sentPricing ?? null);
      }
    }
    if (totals2 === "unreachable") pending = [...records, ...pending].slice(-5e3);
  } catch {
    totals2 = "unreachable";
    pending = [...records, ...pending].slice(-5e3);
  }
  $.ui.invalidate("ui.render");
}
function save($, force) {
  queue = queue.then(() => flush($, force)).catch(() => void 0);
}
function register(on, options) {
  const option = (name) => typeof options[name] === "string" ? options[name].trim() : "";
  team.name = option("team").toLowerCase();
  team.option = team.name;
  team.server = option("server").replace(/\/+$/, "");
  team.token = option("token");
  team.user = option("user");
  on("session.start", async ($, e, next) => {
    await load($);
    if (reporting()) $.clock.after(0, async () => save($, true));
    return next(e);
  });
  on("session.end", async ($, e, next) => {
    if (pending.length > 0) {
      save($, true);
      await queue;
    }
    return next(e);
  });
  on("turn.step", async function* ($, e, next) {
    const result = yield* next(e);
    if (!result?.usage) return result;
    const time = await $.clock.now();
    const subagent = e.agentId !== void 0;
    const record = stepRecord(result.usage, { id: `${sessionId}/${e.turnId}/${e.agentId ?? "main"}/${e.index}`, session: sessionId, subagent, time });
    const tally = priceRecord(record, book, pricing?.scenario);
    session = add(session, tally);
    month = add(month, tally);
    gain = { amount: (Date.now() < gain.until ? gain.amount : 0) + (tally.price - tally.alt), until: Date.now() + 4e3 };
    $.clock.after(4100, async () => $.ui.invalidate("ui.render"));
    const key = `${localDay(time)} ${sessionId}`;
    unsaved.set(key, add(unsaved.get(key) ?? NONE, tally));
    if (reporting()) pending.push(record);
    $.ui.invalidate("ui.render");
    $.clock.after(0, async () => save($, false));
    return result;
  });
  on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
    const { Box, Text, Link } = $.ui.resolve(e);
    const theirs = await next(e);
    const parts = statusParts(session, month, totals2, Date.now() < gain.until ? gain.amount : 0);
    const page = team.name ? `${team.server || HOSTED}/${team.name}` : team.server && team.token ? `${team.server}/` : "";
    const link = page ? [Text({ ...TONES.divider, children: [" \u2502 "] }), Link({ href: page, children: [Text({ color: "#8d71d6", underline: true, children: ["team page \u2197"] })] })] : [];
    const ours = Text({ wrap: "truncate-start", children: [...parts.map(([text, tone]) => Text({ ...TONES[tone], children: [text] })), ...link] });
    return Box({ flexDirection: "row", justifyContent: "space-between", columnGap: 2, children: [theirs, ours] });
  });
}
export {
  register
};
