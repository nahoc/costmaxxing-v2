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
import type { RequestRecord } from "@costmaxxing/core";
import { claudeLine, codexLine, codexUsage } from "../../core/test/fixtures.ts";
import { dailySums, teamId, tooOld } from "../src/join.ts";

const DAY = 86_400_000;
const ID = "acme-7kq3x-m9pz2";
const MAIN = new URL("../src/main.ts", import.meta.url).pathname;
const at = (line: string, daysAgo: number) => JSON.stringify({ ...JSON.parse(line), timestamp: new Date(Date.now() - daysAgo * DAY).toISOString() });

test("team names, the Claude Code version gate, and daily sums", () => {
  assert.equal(teamId(" Acme-7KQ3X-m9pz2 "), "acme-7kq3x-m9pz2");
  assert.equal(teamId("acme"), undefined);
  assert.equal(teamId("acme-robotics"), undefined);
  assert.equal(teamId("acme-7kq3x-m9pzu"), undefined);
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
    [
      ["2026-10-01|Claude Code|claude-opus-5-5|0", 2, 4],
      ["2026-10-01|Claude Code|claude-opus-5-5|1", 1, 2],
      ["2026-10-02|Claude Code|claude-opus-5-5|0", 1, 2],
      ["2026-10-02|Codex|claude-opus-5-5|0", 1, 2],
    ],
  );
});

async function setup(version: string) {
  const root = await mkdtemp(join(tmpdir(), "costmaxxing-join-"));
  const calls = join(root, "calls.log");
  const fake = join(root, "claude");
  await writeFile(fake, `#!/bin/sh\necho "$*" >> "${calls}"\nif [ "$1" = "--version" ]; then echo "${version}"; fi\nif [ "$2" = "configure" ]; then cat >> "${calls}"; echo; fi\n`);
  await chmod(fake, 0o755);
  const codexHome = join(root, "codex");
  await mkdir(join(codexHome, "sessions"), { recursive: true });
  await writeFile(join(codexHome, "hooks.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "other-tool stop" }] }] } }));
  const project = join(root, "claude-home", "projects", "-repo");
  await mkdir(project, { recursive: true });
  const usage = { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  await writeFile(
    join(project, "s1.jsonl"),
    [1, 1, 2, 200, 400].map((days, i) => at(claudeLine({ requestId: `r${i}`, sessionId: "s1", usage }), days)).join("\n"),
  );
  await writeFile(join(root, "claude-home", ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "Ada@Acme.example" } }));
  const bodies: { url?: string; body: { user: string; records: RequestRecord[] } }[] = [];
  const admins: { url?: string; auth?: string }[] = [];
  const server = createServer((req, res) => {
    if (req.method === "POST" && /\/(rotate|delete|pricing)$/.test(req.url ?? "")) {
      admins.push({ url: req.url, auth: req.headers.authorization });
      const ok = req.headers.authorization === "Bearer secret-admin";
      const action = req.url?.split("/").at(-1);
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" }).end(JSON.stringify(action === "rotate" ? { id: "acme-22222-33333" } : action === "pricing" ? { pricing: null } : { deleted: ID }));
      return;
    }
    if (req.method === "GET") {
      if (req.url === `/api/teams/${ID}`) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: "Acme", days: 30, people: 0, requests: 0, price: 0, alt: 0 }));
      else res.writeHead(404).end("{}");
      return;
    }
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
    CODEX_HOME: codexHome,
    COSTMAXXING_HOME: join(root, "home"),
    COSTMAXXING_CLAUDE: fake,
    COSTMAXXING_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
  const run = async (args = [ID]) => {
    try {
      return { ...(await promisify(execFile)(process.execPath, [MAIN, ...args], { env })), code: 0 };
    } catch (error) {
      return error as { stdout: string; stderr: string; code: number };
    }
  };
  const runWithInput = (input: string) =>
    new Promise<void>((resolve) => {
      const child = execFile(process.execPath, [MAIN, "codex-hook"], { env }, () => resolve());
      child.stdin?.end(input);
    });
  return { run, hook: runWithInput, bodies, admins, home: env.COSTMAXXING_HOME, codexHome, root, calls: () => readFile(calls, "utf8"), close: () => server.close() };
}

test("npx costmaxxing <team>: installs and configures the mod, then uploads a year of daily sums", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  const result = await s.run();
  s.close();
  assert.equal(result.code, 0, result.stderr);
  const lines = (await s.calls()).trim().split("\n");
  assert.deepEqual(lines.slice(0, 6), [
    "--version",
    "plugin marketplace add nahoc/costmaxxing-v2",
    "plugin marketplace update costmaxxing",
    "plugin install costmaxxing@costmaxxing",
    "plugin update costmaxxing@costmaxxing",
    "plugin configure costmaxxing@costmaxxing --values-stdin",
  ]);
  const options = JSON.parse(lines[6] ?? "{}");
  assert.equal(options.team, ID);
  assert.match(options.user, /^[0-9a-f]{16}$/);
  const upload = s.bodies[0];
  assert.equal(upload?.url, `/api/teams/${ID}/backfill`);
  assert.equal(upload?.body.user, options.user);
  assert.deepEqual(upload?.body.records.map((r) => r.requests).sort(), [1, 1, 2]);
  assert.match(result.stdout, /costmaxxing is on for Acme\./);
  assert.ok(result.stdout.includes(`/${ID}\n`));
  assert.ok(result.stdout.includes(`Teammates join with: npx costmaxxing ${ID}`));
});

test("npx costmaxxing <team>: an old Claude Code stops before touching anything when there's no one to ask", async () => {
  const s = await setup("2.1.284 (Claude Code)");
  const result = await s.run();
  s.close();
  assert.equal(result.code, 1);
  assert.match(result.stderr, /needs Claude Code 2\.1\.287 or later, and you have 2\.1\.284/);
  assert.equal((await s.calls()).trim(), "--version");
  assert.equal(s.bodies.length, 0);
});

test("plain costmaxxing asks for the team ID in a terminal; piped, it prints the report without asking", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  const piped = await s.run([]);
  s.close();
  assert.equal(piped.code, 0, piped.stderr);
  assert.doesNotMatch(piped.stdout, /team ID/);
  assert.equal(s.bodies.length, 0);
});

test("npx costmaxxing <id>: a wrong or unknown ID stops before touching Claude Code", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  const plain = await s.run(["acme"]);
  const unknown = await s.run(["acme-zzzzz-zzzzz"]);
  s.close();
  assert.equal(plain.code, 1);
  assert.match(plain.stderr, /isn't a team ID/);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /no team has the ID acme-zzzzz-zzzzz/);
  assert.equal(await s.calls().catch(() => ""), "");
});

test("joining adds a background Codex Stop hook beside existing ones, and the hook sends each Codex turn once", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  assert.equal((await s.run()).code, 0);
  const hooks = JSON.parse(await readFile(join(s.codexHome, "hooks.json"), "utf8")).hooks.Stop;
  assert.equal(hooks.length, 2);
  assert.equal(hooks[0].hooks[0].command, "other-tool stop");
  assert.match(hooks[1].hooks[0].command, / codex-hook$/);
  assert.equal(hooks[1].hooks[0].async, true);
  assert.equal((await s.run()).code, 0);
  assert.equal(JSON.parse(await readFile(join(s.codexHome, "hooks.json"), "utf8")).hooks.Stop.length, 2);

  const transcript = join(s.codexHome, "sessions", "rollout-1.jsonl");
  const turn = (id: string) => at(codexLine("token_usage_record", { response_id: id, session_id: "c1", usage: codexUsage(2000, 1000, 100) }), -0.0001);
  const before = s.bodies.length;
  await writeFile(transcript, [codexLine("session_meta", { id: "c1" }, 0), codexLine("turn_context", { model: "gpt-5.6-sol" }, 0), at(JSON.parse(JSON.stringify(turn("r_old"))), 3), turn("r1")].join("\n"));
  await s.hook(JSON.stringify({ transcript_path: transcript, session_id: "c1" }));
  await writeFile(transcript, [codexLine("session_meta", { id: "c1" }, 0), codexLine("turn_context", { model: "gpt-5.6-sol" }, 0), at(JSON.parse(JSON.stringify(turn("r_old"))), 3), turn("r1"), turn("r2")].join("\n"));
  await s.hook(JSON.stringify({ transcript_path: transcript, session_id: "c1" }));
  await s.hook(JSON.stringify({ transcript_path: transcript, session_id: "c1" }));
  s.close();
  const sent = s.bodies.slice(before).filter((b) => b.url?.endsWith("/usage"));
  assert.deepEqual(sent.map((b) => b.body.records.map((r) => [r.harness, r.model])), [[["Codex", "gpt-5.6-sol"]], [["Codex", "gpt-5.6-sol"]]]);
});

test("costmaxxing team shows the joined team's page link and totals, and says when there's no team", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  const none = await s.run(["team"]);
  assert.match(none.stdout, /You're not on a team/);
  assert.equal((await s.run()).code, 0);
  const shown = await s.run(["team"]);
  s.close();
  assert.match(shown.stdout, /You're on Acme\. Team page: http:\/\/127\.0\.0\.1:\d+\/acme-7kq3x-m9pz2/);
  assert.match(shown.stdout, /Teammates join with: npx costmaxxing acme-7kq3x-m9pz2/);
});

test("costmaxxing team rotate, pricing, and delete use the saved admin key; members without it are refused", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  assert.equal((await s.run()).code, 0);
  const noKey = await s.run(["team", "rotate"]);
  assert.equal(noKey.code, 1);
  assert.match(noKey.stderr, /only the person who started the team/);
  const saved = JSON.parse(await readFile(join(s.home, "team.json"), "utf8"));
  await writeFile(join(s.home, "team.json"), JSON.stringify({ ...saved, admin: "secret-admin" }));
  assert.equal((await s.run()).code, 0);
  assert.equal(JSON.parse(await readFile(join(s.home, "team.json"), "utf8")).admin, "secret-admin");
  const rotated = await s.run(["team", "rotate"]);
  assert.match(rotated.stdout, /New team ID: acme-22222-33333/);
  assert.equal(JSON.parse(await readFile(join(s.home, "team.json"), "utf8")).id, "acme-22222-33333");
  assert.match((await s.run(["team", "pricing"])).stdout, /default open-weight plan/);
  const deleted = await s.run(["team", "delete"]);
  s.close();
  assert.match(deleted.stdout, /Deleted acme-22222-33333/);
  assert.deepEqual(JSON.parse(await readFile(join(s.home, "team.json"), "utf8")), {});
  assert.deepEqual(s.admins.map((a) => [a.url?.split("/").at(-1), a.auth]), [["rotate", "Bearer secret-admin"], ["pricing", "Bearer secret-admin"], ["delete", "Bearer secret-admin"]]);
});

test("costmaxxing team leave clears the mod's team, removes only our Codex hook, and keeps the starter's admin key aside", async () => {
  const s = await setup("2.1.289 (Claude Code)");
  assert.equal((await s.run()).code, 0);
  const saved = JSON.parse(await readFile(join(s.home, "team.json"), "utf8"));
  await writeFile(join(s.home, "team.json"), JSON.stringify({ ...saved, admin: "secret-admin" }));
  const left = await s.run(["team", "leave"]);
  s.close();
  assert.equal(left.code, 0, left.stderr);
  assert.match(left.stdout, /Left acme-7kq3x-m9pz2\./);
  assert.match((await s.calls()).trim(), /plugin configure costmaxxing@costmaxxing --values-stdin\n\{"team":"","user":""\}$/);
  const stop = JSON.parse(await readFile(join(s.codexHome, "hooks.json"), "utf8")).hooks.Stop;
  assert.deepEqual(stop.map((g: { hooks: { command: string }[] }) => g.hooks[0]?.command), ["other-tool stop"]);
  await assert.rejects(readFile(join(s.home, "team.json"), "utf8"));
  assert.deepEqual(JSON.parse(await readFile(join(s.home, "admin-acme-7kq3x-m9pz2.json"), "utf8")), { id: ID, admin: "secret-admin" });
});
