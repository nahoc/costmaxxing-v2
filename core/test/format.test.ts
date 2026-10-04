import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReport,
  count,
  parseModelsDev,
  parseSpendReport,
  priceBook,
  renderHtml,
  renderTerminal,
  seatText,
  usd,
  type RequestRecord,
} from "../src/index.ts";
import { DAY, MODELS_DEV, NOW, SPEND_CSV } from "./fixtures.ts";

const book = priceBook(parseModelsDev(MODELS_DEV));

test("compact numbers and whole dollars", () => {
  assert.deepEqual(
    [49_300, 7.04e9, 1949, 999, 123_456].map(count),
    ["49k", "7B", "1.9k", "999", "123k"],
  );
  assert.deepEqual(
    [0.49, 0.5, 646.4, 1949, 2500, 150_000, 1_200_000, -40].map(usd),
    ["<$1", "$1", "$646", "$1.9k", "$2.5k", "$150k", "$1.2M", "-$40"],
  );
});

test("seat line wording", () => {
  assert.equal(
    seatText({ kind: "seats", premium: 8, standard: 7, estimated: true, monthly: 1175, worth: 12_000 }),
    "8 Premium + 7 Standard seats (estimated): $1.2k/month for usage worth $12k at API prices (10× subsidy)",
  );
  assert.equal(
    seatText({ kind: "plan", name: "Claude Max", monthly: 200, worth: 950 }),
    "Claude Max: $200/month for usage worth $950 at API prices (4.8× subsidy)",
  );
});

const records: RequestRecord[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  harness: i % 3 === 0 ? "Codex" : "Claude Code",
  model: ["claude-opus-5-5", "claude-haiku-4-5", "gpt-6-sol", "claude-sonnet-5", "gpt-6-luna", "gpt-6-terra"][i % 6] ?? "",
  time: NOW - (i + 1) * DAY,
  session: `s${i % 4}`,
  subagent: false,
  tokens: { uncached: 400_000 * (i + 1), output: 50_000, cacheRead: 2e6, write5m: 0, write1h: 0 },
}));

test("terminal report: title, hero box, sections in order, and the wording rules", () => {
  const report = buildReport({ dataset: { kind: "logs", records, days: 30, now: NOW }, book });
  const text = renderTerminal(report, { color: false, width: 120, command: "npx costmaxxing" });
  const lines = text.split("\n");
  assert.match(lines[0] ?? "", /^costmaxxing · last 30 days · 4 sessions · 12 requests · \d+(\.\d)?[kMB]? tokens$/);
  for (const phrase of [
    "Switch to open-weight models and potentially save:",
    "GLM-5.3 for hard tasks · GLM-5.3 Flash for mid · DeepSeek V4.1 Flash for grunt work",
    "The last 30 days would've cost: ",
    " on open-weight models instead of ",
    "What will you do when the subsidies end?",
    "If using open-weight models",
  ]) {
    assert.ok(text.includes(phrase), phrase);
  }
  assert.match(text, /\$[\d.]+k? \/ year {5}\$[\d.]+k? \/ month {5}\d+% savings/);
  const order = ["By harness", "Forecast", "Top models", "Providers", "Try next"].map((h) => text.indexOf(`\n${h}`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > (order[i - 1] ?? 0))), `section order ${order}`);
  assert.ok(text.includes("█") && text.includes("⠂"));
  assert.match(text, /\$\S+ +\$\S+ savings/);
  for (const banned of ["you save", "list price", "Daily", "disclaimer", "¢"]) assert.ok(!text.includes(banned), banned);
  assert.ok(!/\$\d+\.\d\d\b/.test(text), "no cents");
});

test("terminal report: color is off unless asked, box lines line up", () => {
  const report = buildReport({ dataset: { kind: "logs", records, days: 30, now: NOW }, book });
  const plain = renderTerminal(report, { color: false, width: 120, command: "npx costmaxxing" });
  assert.ok(!plain.includes("\x1b["));
  const box = plain.split("\n").filter((line) => /^[╭│╰]/.test(line));
  assert.ok(box.length > 5);
  assert.equal(new Set(box.map((line) => [...line].length)).size, 1);
  const colored = renderTerminal(report, { color: true, width: 120, command: "npx costmaxxing" });
  assert.ok(colored.includes("\x1b[38;5;114m█"));
});

test("terminal report: top models stop at 8 rows", () => {
  const report = buildReport({ dataset: { kind: "logs", records, days: 30, now: NOW }, book });
  const models = Array.from({ length: 9 }, (_, i) => ({ label: `model-${i}`, requests: 1, tokens: 1, price: 9 - i, alt: 0 }));
  const text = renderTerminal({ ...report, models }, { color: false, width: 120, command: "costmaxxing" });
  assert.ok(text.includes("model-7") && !text.includes("model-8"));
  assert.match(text, /\+ 1 more \(--json for all\)/);
});

test("team report renders by user and by product, and HTML escapes user data", () => {
  const rows = parseSpendReport(SPEND_CSV).map((row) =>
    row.user === "ada@example.com" ? { ...row, user: "<b>ada</b>@example.com" } : row,
  );
  const report = buildReport({ dataset: { kind: "spend", rows, from: "2026-09-02", to: "2026-10-01", org: "Acme" }, book });
  const text = renderTerminal(report, { color: false, width: 120, command: "npx costmaxxing" });
  assert.ok(text.startsWith("costmaxxing · Acme · 2026-09-02 to 2026-10-01 · 3 users · 20 requests"));
  assert.ok(text.indexOf("\nBy user") < text.indexOf("\nBy product"));
  assert.ok(!text.includes("\nBy harness"));
  assert.ok(text.includes("(estimated): $175/month"));
  const html = renderHtml(report, { full: false });
  assert.ok(html.includes("&#60;b&#62;ada&#60;/b&#62;@example.com"));
  assert.ok(!html.includes("<b>ada"));
  assert.ok(html.includes("By product") && html.includes("Providers") && !html.includes("Forecast"));
  assert.ok(renderHtml(report, { full: true }).includes("Forecast"));
});
