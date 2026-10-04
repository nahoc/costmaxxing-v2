import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
import { MEMBERS_CSV, SPEND_CSV } from "../../core/test/fixtures.ts";
import { lastThirtyDays, teamReport } from "../src/team.ts";

type Route = { status: number; body: string };

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; credentials?: RequestCredentials }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, credentials: init?.credentials });
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const route = key ? routes[key] : undefined;
    if (!route) throw new TypeError("network error");
    return new Response(route.body, { status: route.status });
  };
  return { fetch, calls };
}

const NOW = new Date(2026, 9, 3, 9, 30);
const ORGS = "https://claude.ai/api/organizations";
const orgList = { status: 200, body: JSON.stringify([{ uuid: "personal", name: "Me" }, { uuid: "team-1", name: "Acme" }]) };

test("dates: the last 30 days end yesterday in local time", () => {
  assert.deepEqual(lastThirtyDays(NOW), { from: "2026-09-03", to: "2026-10-02" });
  assert.deepEqual(lastThirtyDays(new Date(2026, 2, 1, 0, 5)), { from: "2026-01-30", to: "2026-02-28" });
});

test("Owner: skips orgs that answer 403, uses the first CSV, exact seats from the members export", async () => {
  const { fetch, calls } = fakeFetch({
    [`${ORGS}/personal/`]: { status: 403, body: '{"error":"forbidden"}' },
    [`${ORGS}/team-1/analytics/spend-report-export`]: { status: 200, body: SPEND_CSV },
    [`${ORGS}/team-1/members/export`]: { status: 200, body: MEMBERS_CSV },
    [ORGS]: orgList,
    "https://models.dev/api.json": { status: 200, body: JSON.stringify(snapshot) },
  });
  const result = await teamReport(fetch, NOW);
  assert.equal(result.kind, "report");
  if (result.kind !== "report") return;
  assert.equal(result.report.org, "Acme");
  assert.equal(result.report.scope, "2026-09-03 to 2026-10-02");
  assert.equal(result.filename, "spend-report-team-1-2026-09-03-to-2026-10-02.csv");
  assert.equal(result.csv, SPEND_CSV);
  assert.deepEqual(result.report.seats && [result.report.seats.kind, result.report.seats.monthly], ["seats", 200]);
  assert.ok(calls.some((c) => c.url === `${ORGS}/team-1/analytics/spend-report-export?start_date=2026-09-03&end_date=2026-10-02`));
  for (const call of calls) {
    const host = new URL(call.url).host;
    assert.ok(host === "claude.ai" || host === "models.dev", call.url);
    assert.equal(call.credentials, host === "claude.ai" ? "include" : undefined, call.url);
  }
});

test("signed out, not an Owner, and failed requests each get their own result", async () => {
  assert.deepEqual(await teamReport(fakeFetch({ [ORGS]: { status: 401, body: "" } }).fetch, NOW), { kind: "signed-out" });
  assert.deepEqual(
    await teamReport(fakeFetch({ [`${ORGS}/`]: { status: 403, body: "" }, [ORGS]: orgList }).fetch, NOW),
    { kind: "not-owner" },
  );
  assert.deepEqual(
    await teamReport(
      fakeFetch({ [`${ORGS}/personal/`]: { status: 403, body: "" }, [`${ORGS}/team-1/`]: { status: 500, body: "" }, [ORGS]: orgList }).fetch,
      NOW,
    ),
    { kind: "failed", request: "GET /api/organizations/team-1/analytics/spend-report-export", status: "500" },
  );
  assert.deepEqual(await teamReport(fakeFetch({ [ORGS]: { status: 503, body: "" } }).fetch, NOW), {
    kind: "failed",
    request: "GET /api/organizations",
    status: "503",
  });
});

test("models.dev down and a members export that isn't CSV: snapshot prices and estimated seats", async () => {
  const result = await teamReport(
    fakeFetch({
      [`${ORGS}/team-1/analytics/spend-report-export`]: { status: 200, body: SPEND_CSV },
      [`${ORGS}/team-1/members/export`]: { status: 200, body: "<html>sign in</html>" },
      [`${ORGS}/personal/`]: { status: 403, body: "" },
      [ORGS]: orgList,
    }).fetch,
    NOW,
  );
  assert.equal(result.kind, "report");
  if (result.kind !== "report") return;
  assert.equal(result.report.seats?.kind === "seats" && result.report.seats.estimated, true);
  assert.ok(result.report.hero.price > 0);
});

test("the extension's numbers match costmaxxing import on the same CSV", async () => {
  const result = await teamReport(
    fakeFetch({
      [`${ORGS}/team-1/analytics/spend-report-export`]: { status: 200, body: SPEND_CSV },
      [`${ORGS}/team-1/members/export`]: { status: 404, body: "" },
      [`${ORGS}/personal/`]: { status: 403, body: "" },
      [ORGS]: orgList,
      "https://models.dev/api.json": { status: 200, body: JSON.stringify(snapshot) },
    }).fetch,
    new Date(),
  );
  assert.equal(result.kind, "report");
  if (result.kind !== "report") return;
  const dir = await mkdtemp(join(tmpdir(), "costmaxxing-ext-"));
  const file = join(dir, result.filename);
  await writeFile(file, result.csv);
  const main = new URL("../../cli/src/main.ts", import.meta.url).pathname;
  const { stdout } = await promisify(execFile)(process.execPath, [main, "import", file, "--offline", "--json"], {
    env: { PATH: process.env.PATH ?? "", COSTMAXXING_HOME: join(dir, "home") },
  });
  const imported = JSON.parse(stdout);
  assert.deepEqual({ ...imported, org: "Acme" }, JSON.parse(JSON.stringify(result.report)));
  assert.equal(imported.hero.price.toFixed(2), result.report.hero.price.toFixed(2));
});
