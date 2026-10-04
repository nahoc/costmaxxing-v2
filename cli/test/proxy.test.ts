import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import type { RequestRecord } from "@costmaxxing/core";
import { joinUrl, startProxy } from "../src/proxy.ts";

const ANTHROPIC_SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"claude-opus-5-5","usage":{"input_tokens":10,"cache_creation_input_tokens":300,"cache_read_input_tokens":5,"cache_creation":{"ephemeral_5m_input_tokens":100,"ephemeral_1h_input_tokens":200},"output_tokens":1}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","usage":{"input_tokens":10,"cache_creation_input_tokens":300,"cache_read_input_tokens":5,"output_tokens":42}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

const CODEX_SSE =
  'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_9","model":"gpt-6-sol"}}\n\n' +
  'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_9","model":"gpt-6-sol","usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":60},"output_tokens":7}}}\n\n';

async function fakeUpstream(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void) {
  const seen: { method?: string; url?: string; headers: IncomingMessage["headers"]; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    handler(req, res, body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/base`, seen, close: () => server.close() };
}

function call(url: string, body = '{"model":"x"}', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingMessage["headers"]; body: Buffer }>((resolve, reject) => {
    const req = request(url, { method: "POST", headers: { "content-type": "application/json", ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function withProxy(upstream: string, run: (url: string, records: RequestRecord[]) => Promise<void>) {
  const records: RequestRecord[] = [];
  const proxy = await startProxy({ harness: "Claude Code", session: "launch-1", route: (req) => joinUrl(upstream, req.url ?? "/"), onRecord: (r) => records.push(r) });
  try {
    await run(proxy.url, records);
    await proxy.drain(5000);
  } finally {
    await proxy.close();
  }
  return records;
}

test("forwards requests and gzip SSE responses unchanged and records usage by request-id", async () => {
  const compressed = gzipSync(ANTHROPIC_SSE);
  const upstream = await fakeUpstream((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "content-encoding": "gzip", "request-id": "req_abc" });
    res.end(compressed);
  });
  const records = await withProxy(upstream.url, async (url) => {
    const response = await call(`${url}/v1/messages?beta=true`, '{"stream":true}', {
      authorization: "Bearer secret",
      "x-claude-code-session-id": "cc-session",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, compressed);
    assert.equal(response.headers["content-encoding"], "gzip");
  });
  upstream.close();
  assert.equal(upstream.seen[0]?.url, "/base/v1/messages?beta=true");
  assert.equal(upstream.seen[0]?.body, '{"stream":true}');
  assert.equal(upstream.seen[0]?.headers.authorization, "Bearer secret");
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record?.id, "req_abc");
  assert.equal(record?.session, "cc-session");
  assert.deepEqual(record?.tokens, { uncached: 10, output: 42, cacheRead: 5, write5m: 100, write1h: 200 });
  assert.ok(!JSON.stringify(record).includes("secret"));
});

test("records an SSE response without a content-type even when the client hangs up after the final event", async () => {
  const upstream = await fakeUpstream((_req, res) => {
    res.writeHead(200, { "session-id": "x" });
    res.write(CODEX_SSE);
  });
  const records = await withProxy(upstream.url, async (url) => {
    await new Promise<void>((resolve) => {
      const req = request(`${url}/responses`, { method: "POST" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("response.completed")) {
            req.destroy();
            setTimeout(resolve, 50);
          }
        });
      });
      req.end("{}");
    });
  });
  upstream.close();
  assert.deepEqual(
    records.map((r) => [r.id, r.model, r.tokens.uncached, r.tokens.cacheRead, r.tokens.output]),
    [["resp_9", "gpt-6-sol", 40, 60, 7]],
  );
});

test("records JSON responses, skips errors and count_tokens, and answers 502 when upstream is down", async () => {
  const upstream = await fakeUpstream((req, res) => {
    if (req.url?.endsWith("/count_tokens")) return res.end('{"input_tokens":12}');
    if (req.url?.endsWith("/bad")) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end('{"type":"error","usage":{"input_tokens":1}}');
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"type":"message","id":"msg_j","model":"claude-haiku-4-5","usage":{"input_tokens":3,"output_tokens":4}}');
  });
  const records = await withProxy(upstream.url, async (url) => {
    await call(`${url}/v1/messages`);
    await call(`${url}/v1/messages/count_tokens`);
    assert.equal((await call(`${url}/bad`)).status, 400);
  });
  upstream.close();
  assert.deepEqual(
    records.map((r) => [r.id, r.session, r.tokens.output]),
    [["msg_j", "launch-1", 4]],
  );
  const down = await withProxy("http://127.0.0.1:9/nowhere", async (url) => {
    const response = await call(`${url}/v1/messages`);
    assert.equal(response.status, 502);
    assert.match(response.body.toString(), /costmaxxing proxy/);
  });
  assert.equal(down.length, 0);
});

test("drain waits for requests still in flight", async () => {
  let finish: (() => void) | undefined;
  const upstream = await fakeUpstream((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(ANTHROPIC_SSE.slice(0, 200));
    finish = () => res.end(ANTHROPIC_SSE.slice(200));
  });
  const records: RequestRecord[] = [];
  const proxy = await startProxy({ harness: "Claude Code", session: "s", route: (req) => joinUrl(upstream.url, req.url ?? "/"), onRecord: (r) => records.push(r) });
  const pending = call(`${proxy.url}/v1/messages`);
  while (!finish) await new Promise((r) => setTimeout(r, 10));
  const drained = proxy.drain(5000);
  assert.equal(records.length, 0);
  finish();
  await drained;
  await pending;
  assert.equal(records.length, 1);
  await proxy.close();
  upstream.close();
});
