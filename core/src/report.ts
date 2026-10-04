import { findPrice, Pricer, type Fallback } from "./prices.ts";
import { modelScenario, PLAN_PROVIDERS, planDetail, planScenario, route, type Scenario } from "./scenarios.ts";
import type { SeatCount } from "./spend.ts";
import { totalTokens, type Dataset, type Harness, type PriceBook, type Tokens } from "./types.ts";

const DAY = 86_400_000;

export interface Cost {
  price: number;
  alt: number;
}

export interface Row extends Cost {
  label: string;
  requests: number;
  tokens: number;
}

export interface ForecastRow {
  label: string;
  days: number;
  perDay: Cost;
  month: Cost;
  year: Cost;
}

export type Comparison =
  | { kind: "priced"; name: string; alt: number; savings: number; percent: number }
  | { kind: "missing"; name: string; models: string[] };

export type SeatLine = { monthly: number; worth: number } & (
  | { kind: "plan"; name: string }
  | { kind: "seats"; premium: number; standard: number; estimated: boolean }
);

export interface Plan {
  name: string;
  monthlyUsd: number;
  harnesses?: Harness[];
}

export type Billing = "monthly" | "annual";

const SEAT_PRICES: Record<Billing, SeatCount> = {
  monthly: { premium: 125, standard: 25 },
  annual: { premium: 100, standard: 20 },
};

export interface ReportOptions {
  dataset: Dataset;
  book: PriceBook;
  vs?: string[];
  scenarios?: Scenario[];
  plan?: Plan;
  seats?: SeatCount;
  billing?: Billing;
}

export interface Report {
  kind: Dataset["kind"];
  scope: string;
  recent: boolean;
  org?: string;
  days: number;
  sessions?: number;
  users?: number;
  requests: number;
  tokens: number;
  hero: { name: string; detail?: string; price: number; alt: number; month: number; year: number; percent: number };
  seats?: SeatLine;
  byHarness?: Row[];
  byUser?: Row[];
  byProduct?: Row[];
  models: Row[];
  forecast: ForecastRow[];
  providers: Comparison[];
  scenarios: Comparison[];
  unpriced: { model: string; requests: number }[];
  fallbacks: Fallback[];
}

interface Item {
  model: string;
  requests: number;
  tokens: Tokens;
  subagent: boolean;
  providers: readonly string[];
  harness?: Harness;
  user?: string;
  product?: string;
  session?: string;
  time?: number;
}

interface Priced extends Cost {
  item: Item;
  label: string;
}

const SOURCE_PROVIDERS: Record<Harness | "claude.ai", readonly string[]> = {
  "Claude Code": ["anthropic", "openai"],
  Codex: ["openai", "anthropic"],
  "claude.ai": ["anthropic"],
};

function items(dataset: Dataset): Item[] {
  if (dataset.kind === "spend") {
    return dataset.rows.map((row) => ({ ...row, subagent: false, providers: SOURCE_PROVIDERS["claude.ai"] }));
  }
  const since = dataset.now - dataset.days * DAY;
  return dataset.records
    .filter((record) => record.time >= since && record.time <= dataset.now)
    .map((record) => ({ ...record, requests: 1, providers: SOURCE_PROVIDERS[record.harness] }));
}

function sum<T>(list: T[], value: (entry: T) => number): number {
  let total = 0;
  for (const entry of list) total += value(entry);
  return total;
}

function totals(priced: Priced[]): Cost {
  return { price: sum(priced, (p) => p.price), alt: sum(priced, (p) => p.alt) };
}

function table(priced: Priced[], key: (p: Priced) => string | undefined): Row[] {
  const rows = new Map<string, Row>();
  for (const p of priced) {
    const label = key(p);
    if (label === undefined) continue;
    const row = rows.get(label) ?? { label, requests: 0, tokens: 0, price: 0, alt: 0 };
    row.requests += p.item.requests;
    row.tokens += totalTokens(p.item.tokens);
    row.price += p.price;
    row.alt += p.alt;
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => b.price - a.price);
}

function pace(label: string, days: number, cost: Cost): ForecastRow {
  const per = (n: number) => ({ price: (cost.price / days) * n, alt: (cost.alt / days) * n });
  return { label, days, perDay: per(1), month: per(30), year: per(365) };
}

function inclusiveDays(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
}

export function buildReport(options: ReportOptions): Report {
  const { dataset, book } = options;
  const pricer = new Pricer();
  const unpriced = new Map<string, number>();
  const all = items(dataset);

  const missing = (scenario: Scenario) => {
    const refs = scenario.routes.map(([, ref]) => ref);
    if (scenario.subagent) refs.push(scenario.subagent);
    return [...new Set(refs.filter((ref) => !book.has(ref)))];
  };
  const costUnder = (scenario: Scenario, p: { item: Item; price: number }) => {
    const ref = route(scenario, p.item.model, p.item.subagent);
    const target = ref === undefined ? undefined : book.get(ref);
    return target ? pricer.cost(target, p.item.requests, p.item.tokens) : p.price;
  };

  const [vsHero, ...vsRest] = options.vs ?? [];
  const plan = PLAN_PROVIDERS[0]!;
  const hero = vsHero ? modelScenario(vsHero, book) : planScenario(plan);
  const heroMissing = missing(hero);
  if (heroMissing.length > 0) throw new Error(`no price for ${heroMissing.join(", ")}`);

  const priced: Priced[] = [];
  for (const item of all) {
    const source = findPrice(book, item.providers, item.model);
    if (!source) {
      unpriced.set(item.model, (unpriced.get(item.model) ?? 0) + item.requests);
      continue;
    }
    const price = pricer.cost(source, item.requests, item.tokens);
    priced.push({ item, label: source.name, price, alt: costUnder(hero, { item, price }) });
  }

  const compare = (scenario: Scenario): Comparison => {
    const absent = missing(scenario);
    if (absent.length > 0) {
      return { kind: "missing", name: scenario.name, models: absent.map((ref) => ref.slice(ref.indexOf("/") + 1)) };
    }
    const window = totals(priced);
    const alt = sum(priced, (p) => costUnder(scenario, p));
    const savings = window.price - alt;
    return { kind: "priced", name: scenario.name, alt, savings, percent: window.price > 0 ? savings / window.price : 0 };
  };
  const bySavings = (list: Comparison[]) => [
    ...list.flatMap((c) => (c.kind === "priced" ? [c] : [])).sort((a, b) => b.savings - a.savings),
    ...list.filter((c) => c.kind === "missing"),
  ];

  let days: number;
  let span: number;
  let forecast: ForecastRow[];
  if (dataset.kind === "spend") {
    days = inclusiveDays(dataset.from, dataset.to);
    span = days;
    forecast = [pace(`${days}-day average`, days, totals(priced))];
  } else {
    days = dataset.days;
    let earliest = dataset.now;
    for (const p of priced) earliest = Math.min(earliest, p.item.time ?? earliest);
    const elapsed = (dataset.now - earliest) / DAY;
    forecast = [...new Set([Math.min(7, days), days])].map((window) => {
      const since = dataset.now - window * DAY;
      const recent = priced.filter((p) => (p.item.time ?? 0) >= since);
      return pace(`${window}-day average`, Math.max(1, Math.min(window, elapsed)), totals(recent));
    });
    span = forecast.at(-1)!.days;
  }

  const window = totals(priced);
  const pacing = forecast.at(-1)!;
  const harnesses = dataset.kind === "logs" ? options.plan?.harnesses : undefined;
  const covered = harnesses ? priced.filter((p) => p.item.harness && harnesses.includes(p.item.harness)) : priced;
  const worth = (sum(covered, (p) => p.price) / span) * 30;
  let seats: SeatLine | undefined;
  if (options.plan) {
    seats = { kind: "plan", name: options.plan.name, monthly: options.plan.monthlyUsd, worth };
  } else if (dataset.kind === "spend") {
    const count = options.seats ?? estimateSeats(dataset.rows);
    const rate = SEAT_PRICES[options.billing ?? "monthly"];
    seats = {
      kind: "seats",
      ...count,
      estimated: !options.seats,
      monthly: count.premium * rate.premium + count.standard * rate.standard,
      worth,
    };
  }

  const users = new Set(all.flatMap((item) => item.user ?? []));
  const sessions = new Set(all.flatMap((item) => item.session ?? []));
  return {
    kind: dataset.kind,
    recent: dataset.kind === "logs" || dataset.recent === true,
    scope: dataset.kind === "spend" ? `${dataset.from} to ${dataset.to}` : `last ${days} days`,
    org: dataset.kind === "spend" ? dataset.org : undefined,
    days,
    sessions: dataset.kind === "logs" ? sessions.size : undefined,
    users: users.size > 0 ? users.size : undefined,
    requests: sum(all, (item) => item.requests),
    tokens: sum(all, (item) => totalTokens(item.tokens)),
    hero: {
      name: vsHero ? hero.name : "open-weight models",
      detail: vsHero ? undefined : planDetail(plan, book),
      ...window,
      month: pacing.month.price - pacing.month.alt,
      year: pacing.year.price - pacing.year.alt,
      percent: window.price > 0 ? (window.price - window.alt) / window.price : 0,
    },
    seats,
    byHarness: dataset.kind === "logs" ? table(priced, (p) => p.item.harness) : undefined,
    byUser: users.size > 0 ? table(priced, (p) => p.item.user) : undefined,
    byProduct: dataset.kind === "spend" ? table(priced, (p) => p.item.product) : undefined,
    models: table(priced, (p) => p.label),
    forecast,
    providers: bySavings(PLAN_PROVIDERS.map((provider) => compare(planScenario(provider)))),
    scenarios: bySavings([...vsRest.map((ref) => modelScenario(ref, book)), ...(options.scenarios ?? [])].map(compare)),
    unpriced: [...unpriced].map(([model, requests]) => ({ model, requests })).sort((a, b) => b.requests - a.requests),
    fallbacks: [...pricer.fallbacks.values()],
  };
}

export function estimateSeats(rows: { user: string; model: string }[]): SeatCount {
  const everyone = new Set(rows.map((row) => row.user).filter((user) => user !== ""));
  const premium = new Set(rows.filter((row) => everyone.has(row.user) && /fable/i.test(row.model)).map((row) => row.user));
  return { premium: premium.size, standard: everyone.size - premium.size };
}
