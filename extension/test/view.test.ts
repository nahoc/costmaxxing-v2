import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, parseModelsDev, parseSpendReport, priceBook, usd } from "@openmaxxing/core";
import snapshot from "@openmaxxing/core/snapshot" with { type: "json" };
import { MEMBERS_CSV, SPEND_CSV } from "../../core/test/fixtures.ts";
import { type Step, teamReport } from "../src/team.ts";
import { memoView } from "../src/view.ts";

const ORGS = "https://claude.ai/api/organizations";
const ROUTES: Record<string, string> = {
  [`${ORGS}/team-1/analytics/spend-report-export`]: SPEND_CSV,
  [`${ORGS}/team-1/members/export`]: MEMBERS_CSV,
  [ORGS]: JSON.stringify([{ uuid: "team-1", name: "Acme <Robotics>" }]),
  "https://models.dev/api.json": JSON.stringify(snapshot),
};
const fetch = async (url: string) => {
  const key = Object.keys(ROUTES).find((prefix) => url.startsWith(prefix));
  if (!key) throw new TypeError("network error");
  return new Response(ROUTES[key]);
};

test("loading reports each real step in order, ending on pricing", async () => {
  const steps: Step[] = [];
  await teamReport(fetch, new Date(2026, 9, 3), (step) => steps.push(step));
  assert.deepEqual(
    steps.map((s) => s.text.replace(/\d[\d,]*/, "N")),
    ["Finding your organization…", "Fetching the spend report for Acme <Robotics>…", "Checking seats…", "Loading prices from models.dev…", "Pricing N requests…"],
  );
  assert.ok(steps.every((s, i) => i === 0 || s.progress > (steps[i - 1]?.progress ?? 0)));
});

test("the memo shows core's numbers, escapes the org, and every figure opens an Info window", async () => {
  const result = await teamReport(fetch, new Date(2026, 9, 3));
  assert.equal(result.kind, "report");
  if (result.kind !== "report") return;
  for (const full of [true, false]) {
    const html = memoView(result.report, { href: "blob:x", filename: result.filename }, full);
    assert.ok(html.includes("Acme &#60;Robotics&#62;") && !html.includes("Acme <Robotics>"));
    assert.ok(html.includes(usd(result.report.hero.year)) && html.includes(usd(result.report.hero.price)));
    const targets = [...html.matchAll(/data-info="([^"]+)"/g)].map((m) => m[1] ?? "");
    assert.ok(targets.length >= 5);
    for (const id of targets) assert.ok(html.includes(`id="${id}"`), id);
    assert.equal(html.includes("What will you do when the subsidies end?"), full);
  }
});

test("models of one family share a row, newest version first", () => {
  const opus = SPEND_CSV.split("\n").find((line) => line.includes("claude-opus-5-5")) ?? "";
  const rows = parseSpendReport(`${SPEND_CSV}\n${opus.replace("claude-opus-5-5", "claude-opus-5")}`);
  const report = buildReport({
    dataset: { kind: "spend", rows, from: "2026-09-03", to: "2026-10-02", org: "Acme", recent: true },
    book: priceBook(parseModelsDev(snapshot)),
  });
  const html = memoView(report, { href: "blob:x", filename: "x.csv" }, true);
  assert.equal(html.match(/<td class="name">Claude Opus[^<]*</g)?.join(), '<td class="name">Claude Opus 5.5, 5<');
});
