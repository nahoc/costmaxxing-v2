import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { RequestRecord } from "@costmaxxing/core";
import { connectSettings, gatewayHandler } from "../src/gateway.ts";
import { createProxy, listen } from "../src/proxy.ts";

const TOKEN = "team-token-123456";

async function upstream(name: string) {
  const seen: { url?: string; headers: IncomingMessage["headers"] }[] = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    req.resume();
    res.writeHead(200, { "content-type": "application/json", "request-id": `req_${name}_${seen.length}` });
    res.end(JSON.stringify({ type: "message", id: "m", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

async function gateway() {
  const [anthropic, openai, chatgpt] = await Promise.all([upstream("anthropic"), upstream("openai"), upstream("chatgpt")]);
  const records: RequestRecord[] = [];
  const ingested: RequestRecord[] = [];
  const proxy = createProxy({ session: "gateway", onRecord: (r) => records.push(r) });
  const server = await listen(
    gatewayHandler({
      token: TOKEN,
      forward: proxy.forward,
      dashboard: async () => "<html>team dashboard</html>",
      ingest: async (list) => {
        ingested.push(...list);
        return { days: 30, people: new Set(ingested.map((r) => r.user)).size, requests: ingested.length, price: 12, alt: 2 };
      },
      upstreams: { anthropic: anthropic.url, openai: `${openai.url}/v1`, chatgpt: `${chatgpt.url}/backend-api/codex` },
    }),
  );
  return {
    url: server.url,
    records,
    ingested,
    anthropic,
    openai,
    chatgpt,
    async close() {
      await proxy.drain(2000);
      proxy.destroy();
      await server.close();
      for (const u of [anthropic, openai, chatgpt]) u.close();
    },
  };
}

const auth = { "x-costmaxxing-token": TOKEN, "x-costmaxxing-user": "ada" };

test("gateway: rejects a missing token and forwards authorized requests without the costmaxxing headers", async () => {
  const g = await gateway();
  const denied = await fetch(`${g.url}/anthropic/v1/messages`, { method: "POST", body: "{}" });
  assert.equal(denied.status, 401);
  assert.equal(g.anthropic.seen.length, 0);
  const wrong = await fetch(`${g.url}/anthropic/v1/messages`, { method: "POST", body: "{}", headers: { "x-costmaxxing-token": "nope" } });
  assert.equal(wrong.status, 401);

  const ok = await fetch(`${g.url}/anthropic/v1/messages?beta=true`, {
    method: "POST",
    body: "{}",
    headers: { ...auth, authorization: "Bearer user-key" },
  });
  assert.equal(ok.status, 200);
  await ok.text();
  const [forwarded] = g.anthropic.seen;
  assert.equal(forwarded?.url, "/v1/messages?beta=true");
  assert.equal(forwarded?.headers.authorization, "Bearer user-key");
  assert.equal(forwarded?.headers["x-costmaxxing-token"], undefined);
  assert.equal(forwarded?.headers["x-costmaxxing-user"], undefined);
  await g.close();
  assert.deepEqual(
    g.records.map((r) => [r.id, r.user, r.harness]),
    [["req_anthropic_1", "ada", "Claude Code"]],
  );
});

test("gateway: OpenAI requests go to the ChatGPT backend when signed in with ChatGPT, else the API", async () => {
  const g = await gateway();
  await (await fetch(`${g.url}/openai/responses`, { method: "POST", body: "{}", headers: { ...auth, "chatgpt-account-id": "acct" } })).text();
  await (await fetch(`${g.url}/openai/responses`, { method: "POST", body: "{}", headers: auth })).text();
  await g.close();
  assert.deepEqual(
    g.chatgpt.seen.map((s) => s.url),
    ["/backend-api/codex/responses"],
  );
  assert.deepEqual(
    g.openai.seen.map((s) => s.url),
    ["/v1/responses"],
  );
  assert.deepEqual(
    g.records.map((r) => r.harness),
    ["Codex", "Codex"],
  );
});

test("gateway: a path starting with // stays on the upstream host", async () => {
  const g = await gateway();
  await (await fetch(`${g.url}/anthropic//evil.example/steal`, { method: "POST", body: "{}", headers: auth })).text();
  await g.close();
  assert.equal(g.anthropic.seen[0]?.url, "//evil.example/steal");
});

test("gateway: dashboard asks for the token with Basic auth; unknown paths are 404", async () => {
  const g = await gateway();
  const challenge = await fetch(`${g.url}/`);
  assert.equal(challenge.status, 401);
  assert.match(challenge.headers.get("www-authenticate") ?? "", /Basic realm="costmaxxing"/);
  const page = await fetch(`${g.url}/`, { headers: { authorization: `Basic ${Buffer.from(`anyone:${TOKEN}`).toString("base64")}` } });
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "<html>team dashboard</html>");
  assert.equal((await fetch(`${g.url}/admin`)).status, 404);
  await g.close();
});

test("gateway: the mod posts token counts, stamped with the sender, and gets the team totals back", async () => {
  const g = await gateway();
  const record = {
    id: "s1/t1/main/0",
    harness: "Claude Code",
    model: "claude-opus-5-5",
    time: 1_791_000_000_000,
    session: "s1",
    subagent: false,
    user: "mallory",
    tokens: { uncached: 10, output: 5, cacheRead: 100, write5m: 20, write1h: 0 },
  };
  const post = (body: string, headers: Record<string, string> = auth) =>
    fetch(`${g.url}/costmaxxing/usage`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body });
  assert.equal((await post(JSON.stringify({ records: [record] }), {})).status, 401);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post(JSON.stringify({ records: "x".repeat(1_100_000) }))).status, 400);
  assert.equal((await fetch(`${g.url}/costmaxxing/usage`)).status, 405);
  const ok = await post(JSON.stringify({ records: [record, { id: "missing fields" }] }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { days: 30, people: 1, requests: 1, price: 12, alt: 2 });
  assert.deepEqual(g.ingested, [{ ...record, user: "ada" }]);
  assert.equal(g.anthropic.seen.length, 0);
  await g.close();
});

test("connect: prints Claude Code and Codex settings for the gateway", () => {
  const text = connectSettings("http://gateway.local:8787/", TOKEN, "ada");
  assert.ok(text.includes('"ANTHROPIC_BASE_URL": "http://gateway.local:8787/anthropic"'));
  assert.ok(text.includes(`"ANTHROPIC_CUSTOM_HEADERS": "x-costmaxxing-token: ${TOKEN}\\nx-costmaxxing-user: ada"`));
  assert.ok(text.includes('base_url = "http://gateway.local:8787/openai"'));
  assert.ok(text.includes(`http_headers = { "x-costmaxxing-token" = "${TOKEN}", "x-costmaxxing-user" = "ada" }`));
  assert.ok(text.includes(`claude plugin install costmaxxing@costmaxxing --config server=http://gateway.local:8787 --config token=${TOKEN} --config user=ada`));
  assert.throws(() => connectSettings("gateway.local", TOKEN), /gateway URL/);
  assert.throws(() => connectSettings("ftp://gateway.local", TOKEN), /http:\/\/ or https:\/\//);
});

test("serve: starts on a free port, prints the URL, and serves the dashboard", async () => {
  const home = await mkdtemp(join(tmpdir(), "costmaxxing-web-"));
  const env = { PATH: process.env.PATH ?? "", COSTMAXXING_HOME: home, CLAUDE_CONFIG_DIR: home, CODEX_HOME: home };
  const main = new URL("../src/main.ts", import.meta.url).pathname;
  const start = async (args: string[]) => {
    const child = spawn(process.execPath, [main, ...args], { env });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    while (!/http:\/\/127\.0\.0\.1:\d+/.test(out)) await new Promise((r) => setTimeout(r, 50));
    return { child, url: /http:\/\/127\.0\.0\.1:\d+/.exec(out)?.[0] ?? "", out: () => out };
  };
  const short = spawn(process.execPath, [main, "serve", "--token", "short"], { env });
  let error = "";
  short.stderr.on("data", (chunk: Buffer) => (error += chunk));
  await once(short, "exit");
  assert.match(error, /at least 12 characters/);

  const gw = await start(["serve", "--token", TOKEN, "--port", "0", "--host", "127.0.0.1"]);
  const dashboard = await fetch(`${gw.url}/`, { headers: { authorization: `Basic ${Buffer.from(`x:${TOKEN}`).toString("base64")}` } });
  gw.child.kill();
  assert.equal(dashboard.status, 200);
  assert.match(gw.out(), /connect http:\/\/<this machine>:\d+ --token <token>/);
});
