import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReport,
  parseMembers,
  parseModelsDev,
  parseSpendReport,
  PLAN_PROVIDERS,
  planScenario,
  priceBook,
  route,
  spendReportPeriod,
  type Comparison,
  type RequestRecord,
  type Tokens,
} from "../src/index.ts";
import { DAY, MEMBERS_CSV, MODELS_DEV, NOW, SPEND_CSV } from "./fixtures.ts";

const book = priceBook(parseModelsDev(MODELS_DEV));
const near = (actual: number | undefined, expected: number) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

function record(
  id: string,
  o: { model: string; daysAgo: number; session: string; tokens: Partial<Tokens>; harness?: "Claude Code" | "Codex"; subagent?: boolean },
): RequestRecord {
  return {
    id,
    harness: o.harness ?? "Claude Code",
    model: o.model,
    time: NOW - o.daysAgo * DAY,
    session: o.session,
    subagent: o.subagent ?? false,
    tokens: { uncached: 0, output: 0, cacheRead: 0, write5m: 0, write1h: 0, ...o.tokens },
  };
}

const RECORDS = [
  record("r1", {
    model: "claude-opus-5-5",
    daysAgo: 1,
    session: "A",
    tokens: { uncached: 1000, output: 2000, cacheRead: 100_000, write5m: 10_000, write1h: 5000 },
  }),
  record("r2", { model: "claude-haiku-4-5-20251001", daysAgo: 2, session: "A", tokens: { uncached: 1e6, output: 1e5 } }),
  record("r3", { model: "claude-opus-5-5", daysAgo: 3, session: "B", subagent: true, tokens: { uncached: 1e6 } }),
  record("r4", { model: "gpt-6-terra", harness: "Codex", daysAgo: 10, session: "C", tokens: { uncached: 1e6, output: 1e6 } }),
  record("r5", { model: "mystery-model", harness: "Codex", daysAgo: 1, session: "D", tokens: { uncached: 5e6 } }),
  record("r6", { model: "claude-opus-5-5", daysAgo: 40, session: "E", tokens: { uncached: 1e6 } }),
];

const logs = (vs?: string[]) =>
  buildReport({ dataset: { kind: "logs", records: RECORDS, days: 30, now: NOW }, book, vs });

const PRICE = 0.154 + 1.5 + 4 + 5;
const ALT = 0.03896 + 0.3 + 0.2 + 0.52;

test("tier mapping: haiku and luna to grunt, sonnet and terra to mid, the rest to frontier, subagents to grunt", () => {
  const plan = planScenario(PLAN_PROVIDERS[0]!);
  const tier = (model: string, subagent = false) => route(plan, model, subagent);
  assert.equal(tier("claude-haiku-4-5-20251001"), "boundless/deepseek-v4.1-flash");
  assert.equal(tier("gpt-6-luna"), "boundless/deepseek-v4.1-flash");
  assert.equal(tier("claude-sonnet-5"), "boundless/glm-5.3-flash");
  assert.equal(tier("gpt-5.6-terra"), "boundless/glm-5.3-flash");
  assert.equal(tier("claude-opus-5-5[1m]"), "boundless/glm-5.3");
  assert.equal(tier("gpt-6-sol"), "boundless/glm-5.3");
  assert.equal(tier("claude-opus-5-5", true), "boundless/deepseek-v4.1-flash");
});

test("logs report: totals, window, sessions, and the hero against the Boundless plan", () => {
  const report = logs();
  assert.equal(report.scope, "last 30 days");
  assert.equal(report.requests, 5);
  assert.equal(report.sessions, 4);
  near(report.hero.price, PRICE);
  near(report.hero.alt, ALT);
  assert.equal(report.hero.name, "open-weight models");
  assert.equal(report.hero.detail, "GLM-5.3 for hard tasks · GLM-5.3 Flash for mid · DeepSeek V4.1 Flash for grunt work");
  near(report.hero.month, PRICE - ALT);
  near(report.hero.year, ((PRICE - ALT) / 30) * 365);
  near(report.hero.percent, (PRICE - ALT) / PRICE);
  assert.deepEqual(
    report.byHarness?.map((row) => [row.label, row.requests]),
    [
      ["Claude Code", 3],
      ["Codex", 1],
    ],
  );
  assert.equal(report.seats, undefined);
});

test("unpriced models are listed with request counts and left out of both sides", () => {
  const report = logs();
  assert.deepEqual(report.unpriced, [{ model: "mystery-model", requests: 1 }]);
  near(
    report.models.reduce((n, row) => n + row.price, 0),
    PRICE,
  );
  assert.ok(!report.models.some((row) => row.label === "mystery-model"));
});

test("forecast: average daily cost over the last 7 and 30 days, × 30 and × 365", () => {
  const [week, month] = logs().forecast;
  assert.equal(week?.label, "7-day average");
  assert.equal(week?.days, 7);
  near(week?.perDay.price, (0.154 + 1.5 + 4) / 7);
  near(week?.year.price, ((0.154 + 1.5 + 4) / 7) * 365);
  assert.equal(month?.label, "30-day average");
  near(month?.month.price, PRICE);
  near(month?.year.alt, (ALT / 30) * 365);
});

test("providers: the same plan at each provider, savings first, missing models last", () => {
  const providers = logs().providers;
  const priced = providers.filter((c): c is Extract<Comparison, { kind: "priced" }> => c.kind === "priced");
  assert.deepEqual(
    priced.map((c) => c.name),
    ["Boundless", "Together AI"],
  );
  near(priced[1]?.alt, 0.0572 + 0.42 + 0.3 + 0.65);
  assert.deepEqual(providers.slice(2), [
    { kind: "missing", name: "Baseten", url: "https://www.baseten.co", models: ["deepseek-ai/DeepSeek-V4.1-Flash"] },
    {
      kind: "missing",
      name: "Fireworks",
      url: "https://fireworks.ai",
      models: [
        "accounts/fireworks/models/deepseek-v4p1-flash",
        "accounts/fireworks/models/glm-5p3-flash",
        "accounts/fireworks/models/glm-5p3",
      ],
    },
  ]);
});

test("--vs: the first model replaces the plan in the hero, the rest become scenarios", () => {
  const report = logs(["togetherai/zai-org/GLM-5.3", "openai/gpt-6-luna", "acme/nothing"]);
  assert.equal(report.hero.name, "GLM-5.3");
  assert.equal(report.hero.detail, undefined);
  near(report.hero.alt, 0.0572 + 1.84 + 1.4 + 5.8);
  assert.deepEqual(
    report.scenarios.map((c) => [c.name, c.kind]),
    [
      ["GPT-6 Luna", "priced"],
      ["acme/nothing", "missing"],
    ],
  );
  assert.throws(() => logs(["acme/nothing"]), /no price for acme\/nothing/);
});

test("config plan: subsidy line covers only the plan's harnesses", () => {
  const report = buildReport({
    dataset: { kind: "logs", records: RECORDS, days: 30, now: NOW },
    book,
    plan: { name: "Claude Max", monthlyUsd: 200, harnesses: ["Claude Code"] },
  });
  assert.equal(report.seats?.kind, "plan");
  near(report.seats?.worth, 0.154 + 1.5 + 4);
});

test("spend report: parses quoted cells and prices every row from token columns", () => {
  const rows = parseSpendReport(SPEND_CSV);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[1], {
    user: "ada@example.com",
    product: "Chat",
    model: "claude-fable-5-1",
    requests: 2,
    tokens: { uncached: 20000, output: 1000, cacheRead: 0, write5m: 0, write1h: 0 },
  });
  assert.throws(() => parseSpendReport("a,b\n1,2"), /missing user_email/);
  assert.deepEqual(spendReportPeriod("spend-report-6b4c-2026-09-01-to-2026-09-30 (1).csv"), {
    from: "2026-09-01",
    to: "2026-09-30",
  });
});

test("team report: by user, by product, estimated seats with Fable users as Premium", () => {
  const report = buildReport({
    dataset: { kind: "spend", rows: parseSpendReport(SPEND_CSV), from: "2026-09-02", to: "2026-10-01", org: "Acme" },
    book,
  });
  assert.equal(report.days, 30);
  assert.equal(report.users, 3);
  assert.equal(report.requests, 20);
  near(report.hero.price, 1.793);
  near(report.hero.alt, 0.45848);
  assert.deepEqual(
    report.byUser?.map((row) => row.label),
    ["ada@example.com", "bob@example.com", "cy@example.com"],
  );
  near(report.byUser?.[0]?.price, 1.73);
  assert.deepEqual(
    report.byProduct?.map((row) => row.label),
    ["Claude Code", "Chat", "Cowork"],
  );
  assert.deepEqual(report.unpriced, [{ model: "mystery-model", requests: 3 }]);
  const { worth, ...seats } = report.seats ?? { worth: 0 };
  assert.deepEqual(seats, { kind: "seats", premium: 1, standard: 2, estimated: true, monthly: 175 });
  near(worth, 1.793);
  assert.deepEqual(report.fallbacks, [{ model: "togetherai/zai-org/GLM-5.3", field: "cache_write", rule: "input rate" }]);
  assert.equal(report.byHarness, undefined);
  assert.equal(report.forecast.length, 1);
  assert.equal(report.forecast[0]?.label, "30-day average");
});

test("seats: members export and --seats are exact, annual billing changes the rate", () => {
  const seats = parseMembers(MEMBERS_CSV);
  assert.deepEqual(seats, {
    premium: 1,
    standard: 3,
    byUser: { "ada@example.com": "premium", "bob@example.com": "standard", "cy@example.com": "standard", "di@example.com": "standard" },
  });
  assert.equal(parseMembers('{"members": []}'), undefined);
  assert.equal(parseMembers("Name,Role\nAda,Owner"), undefined);
  const report = buildReport({
    dataset: { kind: "spend", rows: parseSpendReport(SPEND_CSV), from: "2026-09-02", to: "2026-10-01" },
    book,
    seats,
    billing: "annual",
  });
  const { worth, ...line } = report.seats ?? { worth: 0 };
  assert.deepEqual(line, { kind: "seats", premium: 1, standard: 3, estimated: false, monthly: 160 });
  near(worth, 1.793);
});

test("spend rows without an email don't count as users, and thousands separators parse", () => {
  const csv = SPEND_CSV.replace("cy@example.com,c1,Cowork,claude-sonnet-5,1,1000,100", ',c1,Cowork,claude-sonnet-5,1,1000,100').replace(
    "bob@example.com,b1,Claude Code,claude-haiku-4-5-20251001,4,40000,4000,0,0,u2,40000",
    'bob@example.com,b1,Claude Code,claude-haiku-4-5-20251001,4,40000,"4,000",0,0,u2,"40,000"',
  );
  const report = buildReport({ dataset: { kind: "spend", rows: parseSpendReport(csv), from: "2026-09-02", to: "2026-10-01" }, book });
  assert.equal(report.users, 2);
  assert.deepEqual(
    report.byUser?.map((row) => row.label),
    ["ada@example.com", "bob@example.com", "(no email)"],
  );
  near(report.byUser?.[1]?.price, 0.06);
  assert.equal(report.seats?.kind === "seats" && report.seats.premium + report.seats.standard, 2);
});

test("team report: each person carries a seat and how far usage runs past it, and each model its replacement", () => {
  const rows = parseSpendReport(SPEND_CSV);
  const dataset = { kind: "spend" as const, rows, from: "2026-09-02", to: "2026-10-01" };
  const estimated = buildReport({ dataset, book });
  const ada = estimated.byUser?.find((row) => row.label === "ada@example.com");
  assert.equal(ada?.seat, "premium");
  near(ada?.overSeat, 1.73 / 125);
  const bob = estimated.byUser?.find((row) => row.label === "bob@example.com");
  assert.equal(bob?.seat, "standard");
  near(bob?.overSeat, 0.06 / 25);
  const exact = buildReport({ dataset, book, seats: { premium: 2, standard: 1, byUser: { "bob@example.com": "premium" } }, billing: "annual" });
  const bobExact = exact.byUser?.find((row) => row.label === "bob@example.com");
  assert.equal(bobExact?.seat, "premium");
  near(bobExact?.overSeat, 0.06 / 100);
  assert.deepEqual(
    estimated.models.map((row) => [row.label, row.replacement]),
    [
      ["Claude Opus 5.5", "GLM-5.3"],
      ["Claude Fable 5.1", "GLM-5.3"],
      ["Claude Haiku 4.5", "DeepSeek V4.1 Flash"],
      ["Claude Sonnet 5", "GLM-5.3 Flash"],
    ],
  );
  assert.equal(JSON.stringify(estimated.seats).includes("byUser"), false);
});
