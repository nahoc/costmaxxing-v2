import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  buildReport,
  parseModelsDev,
  parseSpendReport,
  priceBook,
  type RequestRecord,
} from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
import { claudeLine, codexLine, codexUsage, SPEND_CSV } from "../../core/test/fixtures.ts";
import { parseConfig } from "../src/config.ts";

const DAY = 86_400_000;
const MAIN = new URL("../src/main.ts", import.meta.url).pathname;

function at(line: string, daysAgo: number): string {
  return JSON.stringify({ ...JSON.parse(line), timestamp: new Date(Date.now() - daysAgo * DAY).toISOString() });
}

async function homes() {
  const root = await mkdtemp(join(tmpdir(), "costmaxxing-"));
  const env = {
    PATH: process.env.PATH ?? "",
    CLAUDE_CONFIG_DIR: join(root, "claude"),
    CODEX_HOME: join(root, "codex"),
    COSTMAXXING_HOME: join(root, "cmx"),
  };
  return { root, env };
}

type Result = { stdout: string; stderr: string; code: number };

async function run(args: string[], env: Record<string, string>): Promise<Result> {
  try {
    return { ...(await promisify(execFile)(process.execPath, [MAIN, ...args], { env })), code: 0 };
  } catch (error) {
    return error as Result;
  }
}

test("report: reads Claude Code and Codex logs, skips stale files, merges proxy records", async () => {
  const { env } = await homes();
  const project = join(env.CLAUDE_CONFIG_DIR, "projects", "-repo");
  await mkdir(join(project, "s1", "subagents"), { recursive: true });
  const opus = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  await writeFile(
    join(project, "s1.jsonl"),
    [
      at(claudeLine({ requestId: "req_1", sessionId: "s1", usage: opus }), 1),
      at(claudeLine({ requestId: "req_1", sessionId: "s1", usage: opus }), 1),
      at(claudeLine({ requestId: "req_2", sessionId: "s1", usage: opus }), 2),
      at(claudeLine({ requestId: "req_old", sessionId: "s1", usage: opus }), 45),
    ].join("\n"),
  );
  await writeFile(
    join(project, "s1", "subagents", "agent-1.jsonl"),
    at(claudeLine({ requestId: "req_sub", sessionId: "s1", usage: opus }), 1),
  );
  const stale = join(project, "stale.jsonl");
  await writeFile(stale, at(claudeLine({ requestId: "req_stale", sessionId: "s9", usage: opus }), 1));
  const old = new Date(Date.now() - 40 * DAY);
  await utimes(stale, old, old);
  const codex = join(env.CODEX_HOME, "sessions", "2026", "10", "01");
  await mkdir(codex, { recursive: true });
  await writeFile(
    join(codex, "rollout-1.jsonl"),
    [
      at(codexLine("session_meta", { id: "t1" }), 1),
      at(codexLine("turn_context", { model: "gpt-5.6-sol" }), 1),
      at(codexLine("token_usage_record", { response_id: "resp_1", session_id: "c1", usage: codexUsage(2000, 1000, 100) }), 1),
    ].join("\n"),
  );
  const proxied: RequestRecord = {
    id: "req_2",
    harness: "Claude Code",
    model: "claude-opus-5-5",
    time: Date.now() - DAY,
    session: "proxy",
    subagent: false,
    tokens: { uncached: 5000, output: 5000, cacheRead: 0, write5m: 0, write1h: 0 },
  };
  const proxyOnly = { ...proxied, id: "req_title", tokens: { ...proxied.tokens, uncached: 10 } };
  await mkdir(env.COSTMAXXING_HOME, { recursive: true });
  await writeFile(join(env.COSTMAXXING_HOME, "usage.jsonl"), `${JSON.stringify(proxied)}\n{"broken\n${JSON.stringify(proxyOnly)}\n`);

  const { stdout } = await run(["--json", "--offline"], env);
  const report = JSON.parse(stdout);
  assert.equal(report.requests, 5);
  assert.equal(report.sessions, 3);
  const claude = report.byHarness.find((row: { label: string }) => row.label === "Claude Code");
  assert.equal(claude.requests, 4);
  assert.equal(claude.tokens, 2000 * 2 + 10_000 + 5010);
  const frontier = (input: number, output: number, cached = 0) => (input * 1.12 + output * 3.52 + cached * 0.14) / 1e6;
  const grunt = (input: number, output: number) => (input * 0.2 + output * 1) / 1e6;
  const alt = frontier(1000, 1000) + grunt(1000, 1000) + frontier(5000, 5000) + frontier(10, 5000) + frontier(1000, 100, 1000);
  assert.ok(Math.abs(report.hero.alt - alt) < 1e-12, `subagent request priced as grunt work: ${report.hero.alt} vs ${alt}`);

  const text = await run(["--offline"], env);
  assert.match(text.stdout, /^costmaxxing · last 30 days · 3 sessions · 5 requests · /);
  assert.ok(!text.stdout.includes("\x1b["), "no color when stdout is not a terminal");
});

test("report: no usage prints where it looked, --json still prints a report", async () => {
  const { env } = await homes();
  const { stdout } = await run(["--offline"], env);
  assert.match(stdout, /No Claude Code or Codex usage in the last 30 days/);
  const json = JSON.parse((await run(["--offline", "--json", "--days", "7"], env)).stdout);
  assert.equal(json.requests, 0);
  assert.equal(json.scope, "last 7 days");
});

test("report: bad flags and unknown --vs models fail with a message", async () => {
  const { env } = await homes();
  const vs = await run(["--offline", "--vs", "acme/nothing"], env);
  assert.equal(vs.code, 1);
  assert.match(vs.stderr, /no price for acme\/nothing/);
  const days = await run(["--days", "0"], env);
  assert.match(days.stderr, /--days takes a whole number/);
});

test("import: prices the CSV exactly like core and reads the period from the file name", async () => {
  const { root, env } = await homes();
  const file = join(root, "spend-report-org-2026-09-02-to-2026-10-01.csv");
  await writeFile(file, SPEND_CSV);
  const report = JSON.parse((await run(["import", file, "--offline", "--json"], env)).stdout);
  const expected = buildReport({
    dataset: { kind: "spend", rows: parseSpendReport(SPEND_CSV), from: "2026-09-02", to: "2026-10-01" },
    book: priceBook(parseModelsDev(snapshot)),
  });
  assert.deepEqual(report, JSON.parse(JSON.stringify(expected)));
  assert.equal(report.seats.estimated, true);

  const exact = JSON.parse((await run(["import", file, "--offline", "--json", "--seats", "premium=2,standard=5", "--billing", "annual"], env)).stdout);
  assert.deepEqual([exact.seats.premium, exact.seats.standard, exact.seats.monthly, exact.seats.estimated], [2, 5, 300, false]);
});

test("import: explains how to get the CSV and when dates are missing", async () => {
  const { root, env } = await homes();
  assert.match((await run(["import"], env)).stderr, /browser extension \(Download CSV\)/);
  const undated = join(root, "export.csv");
  await writeFile(undated, SPEND_CSV);
  assert.match((await run(["import", undated, "--offline"], env)).stderr, /--from YYYY-MM-DD --to YYYY-MM-DD/);
  const text = (await run(["import", undated, "--offline", "--from", "2026-09-01", "--to", "2026-09-30"], env)).stdout;
  assert.match(text, /^costmaxxing · 2026-09-01 to 2026-09-30 · 3 users · 20 requests/);
  assert.match(text, /\n {2}costmaxxing import <csv> --seats premium=N,standard=N/);
  assert.match((await run(["import", undated, "--seats", "gold=1", "--from", "2026-09-01", "--to", "2026-09-30"], env)).stderr, /--seats takes premium=N,standard=N/);
});

test("config: parses plan, scenarios and price overrides, rejects typos", () => {
  const config = parseConfig(`
window_days = 14
[plan]
name = "Claude Max"
monthly_usd = 200
clients = ["claude-code"]
[[scenario]]
name = "Kimi for everything"
map = [["claude-opus-*", "boundless/kimi-k3"], ["*", "boundless/glm-5.3"]]
[prices."boundless/kimi-k3"]
input = 2.3
output = 11.4
cache_read = 0.23
`);
  assert.deepEqual(config, {
    windowDays: 14,
    plan: { name: "Claude Max", monthlyUsd: 200, harnesses: ["Claude Code"] },
    scenarios: [
      {
        name: "Kimi for everything",
        routes: [
          ["claude-opus-*", "boundless/kimi-k3"],
          ["*", "boundless/glm-5.3"],
        ],
      },
    ],
    prices: { "boundless/kimi-k3": { input: 2.3, output: 11.4, cacheRead: 0.23 } },
  });
  assert.throws(() => parseConfig("windows_days = 3"), /unknown key windows_days/);
  assert.throws(() => parseConfig('[plan]\nname = "x"\nmonthly_usd = 1\nclients = ["cursor"]'), /claude-code or codex/);
  assert.throws(() => parseConfig('[prices."a/b"]\ninput = "1"'), /input must be a non-negative number/);
});
