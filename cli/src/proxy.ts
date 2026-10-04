import { request as httpRequest, createServer, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { Agent, request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { StringDecoder } from "node:string_decoder";
import * as zlib from "node:zlib";
import { sseData, wireMeter, type Harness, type RequestRecord, type WireUsage } from "@costmaxxing/core";

export interface ProxyOptions {
  harness: Harness;
  upstream: (req: IncomingMessage) => string;
  session: string;
  host?: string;
  port?: number;
  user?: (req: IncomingMessage) => string | undefined;
  onRecord: (record: RequestRecord) => void;
}

const DECODERS: Record<string, (() => NodeJS.ReadWriteStream) | undefined> = {
  gzip: zlib.createGunzip,
  br: zlib.createBrotliDecompress,
  deflate: zlib.createInflate,
  zstd: zlib.createZstdDecompress,
};

function meterResponse(headers: IncomingHttpHeaders, onUsage: (usage: WireUsage) => void) {
  const meter = wireMeter();
  const decoder = new StringDecoder("utf8");
  const type = headers["content-type"] ?? "";
  let mode: "sse" | "json" | undefined = type.includes("event-stream") ? "sse" : type.includes("json") ? "json" : undefined;
  let buffer = "";
  let reported = false;
  const report = () => {
    const usage = meter.result();
    if (usage && !reported) {
      reported = true;
      onUsage(usage);
    }
  };
  const consume = (text: string) => {
    if (!mode) {
      const start = text.trimStart();
      if (start === "") return;
      mode = start.startsWith("{") ? "json" : "sse";
    }
    buffer += text;
    if (mode === "sse") {
      const { events, rest } = sseData(buffer);
      buffer = rest;
      for (const event of events) meter.event(event);
      report();
    }
  };
  const decode = DECODERS[headers["content-encoding"] ?? ""]?.();
  const decoded = new Promise<void>((resolve) => {
    if (!decode) return resolve();
    decode.on("data", (chunk: Buffer) => consume(decoder.write(chunk)));
    decode.on("end", resolve);
    decode.on("error", () => resolve());
  });
  return {
    write(chunk: Buffer) {
      if (decode) decode.write(chunk);
      else consume(decoder.write(chunk));
    },
    async end() {
      decode?.end();
      await decoded;
      consume(`${decoder.end()}\n`);
      if (mode === "json") {
        try {
          meter.event(JSON.parse(buffer));
        } catch {}
      }
      report();
    },
  };
}

export async function startProxy(options: ProxyOptions) {
  const agent = new Agent({ keepAlive: true });
  let inFlight = 0;
  let wake: (() => void) | undefined;
  const settle = () => {
    inFlight--;
    if (inFlight === 0) wake?.();
  };
  const server = createServer((req, res) => {
    inFlight++;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      settle();
    };
    const base = new URL(options.upstream(req));
    const target = new URL(base.pathname.replace(/\/$/, "") + (req.url ?? "/"), base);
    const user = options.user?.(req);
    const sessionHeader = req.headers["x-claude-code-session-id"] ?? req.headers["session-id"];
    const session = typeof sessionHeader === "string" && sessionHeader ? sessionHeader : options.session;
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = send(
      target,
      { method: req.method, headers: { ...req.headers, host: target.host }, agent: target.protocol === "https:" ? agent : undefined },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.statusMessage, response.headers);
        res.flushHeaders();
        const meter = meterResponse(response.headers, (usage) => {
          if ((response.statusCode ?? 500) >= 400) return;
          const requestId = response.headers["request-id"];
          options.onRecord({
            id: (typeof requestId === "string" ? requestId : undefined) ?? usage.id ?? `${session}:${Date.now()}`,
            harness: options.harness,
            model: usage.model,
            time: Date.now(),
            session,
            subagent: false,
            tokens: usage.tokens,
            ...(user ? { user } : {}),
          });
        });
        response.on("data", (chunk: Buffer) => {
          res.write(chunk);
          meter.write(chunk);
        });
        response.on("end", async () => {
          res.end();
          await meter.end();
          done();
        });
        response.on("close", () => {
          if (response.complete) return;
          res.destroy();
          done();
        });
      },
    );
    upstream.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: `costmaxxing proxy: ${error.message}` } }));
      } else res.destroy();
      done();
    });
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    async drain(timeoutMs: number): Promise<void> {
      if (inFlight === 0) return;
      await Promise.race([
        new Promise<void>((resolve) => (wake = resolve)),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
      ]);
    },
    close(): Promise<void> {
      agent.destroy();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
