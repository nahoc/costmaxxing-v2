import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import type { RequestRecord } from "@openmaxxing/core";
import { claudeLine } from "../../core/test/fixtures.ts";
import { dailySums, teamName, tooOld } from "../src/join.ts";

const DAY = 86_400_000;
const MAIN = new URL("../src/main.ts", import.meta.url).pathname;
const at = (line: string, daysAgo: number) => JSON.stringify({ ...JSON.parse(line), timestamp: new Date(Date.now() - daysAgo * DAY).toISOString() });

test("team names, the Claude Code version gate, and daily sums", () => {
  assert.equal(teamName(" Acme-Robotics "), "acme-robotics");
  assert.equal(teamName("a"), undefined);
  assert.equal(teamName("api"), undefined);
  assert.equal(teamName("acme/x"), undefined);
  assert.equal(tooOld("2.1.284 (Claude Code)"), true);
  assert.equal(tooOld("2.1.287 (Claude Code)"), false);
  assert.equal(tooOld("2.2.0 (Claude Code)"), false);
  const t = { uncached: 1, output: 2, cacheRead: 3, write5m: 4, write1h: 5 };
  const r = (id: string, time: string, extra: Partial<RequestRecord> = {}): RequestRecord => ({
    id, harness: "Claude Code", model: "claude-opus-5-5", time: Date.parse(time), session: "s", subagent: false, tokens: t, ...extra,
  });
  const sums = dailySums([
    r("1", "2026-10-01T01:00:00Z"),
    r("2", "2026-10-01T23:00:00Z"),
    r("3", "2026-10-01T05:00:00Z", { subagent: true }),
    r("4", "2026-10-02T05:00:00Z"),
    r("5", "2026-10-02T05:00:00Z", { harness: "Codex" }),
  ]);
  assert.deepEqual(
    sums.map((s) => [s.id, s.requests, s.tokens.output]),
    [["2026-10-01|claude-opus-5-5|0", 2, 4], ["2026-10-01|claude-opus-5-5|1", 1, 2], ["2026-10-02|claude-opus-5-5|0", 1, 2]],
  );
});

async function setup(version: string) {
  const root = await mkdtemp(join(tmpdir(), "openmaxxing-join-"));
  const calls = join(root, "calls.log");
  const fake = join(root, "claude");
  await writeFile(fake, `#!/bin/sh\necho "$*" >> "${calls}"\nif [ "$1" = "--version" ]; then echo "${version}"; fi\nif [ "$2" = "configure" ]; then cat >> "${calls}"; echo; fi\n`);
  await chmod(fake, 0o755);
  const project = join(root, "claude-home", "projects", "-repo");
  await mkdir(project, { recursive: true });
  const usage = { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  await writeFile(
    join(project, "s1.jsonl"),
    [1, 1, 2, 200, 400].map((days, i) => at(claudeLine({ requestId: `r${i}`, sessionId: "s1", usage }), days)).join("\n"),
  );
  await writeFile(join(root, "claude-home", ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "Ada@Acme.example" } }));
  const bodies: { url?: string; body: { user: string; records: RequestRecord[] } }[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      bodies.push({ url: req.url, body: JSON.parse(text) });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ counted: 4, days: 30, people: 1, requests: 3, price: 1.5, alt: 0.2 }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const env = {
    PATH: process.env.PATH ?? "",
    CLAUDE_CONFIG_DIR: join(root, "claude-home"),
    CODEX_HOME: join(root, "codex"),
    OPENMAXXING_HOME: join(root, "home"),
    OPENMAXXING_CLAUDE: fake,
    OPENMAXXING_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
  const run = async () => {
    try {
      return { ...(await promisify(execFile)(process.execPath, [MAIN, "Acme"], { env })), code: 0 };
    } catch (error) {
      return error as { stdout: string; stderr: string; code: number };
    }
  };
  return { run, bodies, calls: () => readFile(calls, "utf8"), close: () => server.close() };
}

test("npx openmaxxing <team>: installs and configures the mod, then uploads a year of daily sums", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  const result = await s.run();
  s.close();
  assert.equal(result.code, 0, result.stderr);
  const lines = (await s.calls()).trim().split("\n");
  assert.deepEqual(lines.slice(0, 6), [
    "--version",
    "plugin marketplace add nahoc/openmaxxing",
    "plugin marketplace update openmaxxing",
    "plugin install openmaxxing@openmaxxing",
    "plugin update openmaxxing@openmaxxing",
    "plugin configure openmaxxing@openmaxxing --values-stdin",
  ]);
  const options = JSON.parse(lines[6] ?? "{}");
  assert.equal(options.team, "acme");
  assert.match(options.user, /^[0-9a-f]{16}$/);
  const upload = s.bodies[0];
  assert.equal(upload?.url, "/api/teams/acme/backfill");
  assert.equal(upload?.body.user, options.user);
  assert.deepEqual(upload?.body.records.map((r) => r.requests).sort(), [1, 1, 2]);
  assert.match(result.stdout, /openmaxxing is on for acme\./);
  assert.match(result.stdout, /Team page: http:\/\/127\.0\.0\.1:\d+\/acme/);
});

test("npx openmaxxing <team>: an old Claude Code stops before touching anything when there's no one to ask", async () => {
  const s = await setup("2.1.284 (Claude Code)");
  const result = await s.run();
  s.close();
  assert.equal(result.code, 1);
  assert.match(result.stderr, /needs Claude Code 2\.1\.287 or later, and you have 2\.1\.284/);
  assert.equal((await s.calls()).trim(), "--version");
  assert.equal(s.bodies.length, 0);
});
