import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestListener,
  type ServerResponse,
} from "node:http";
import { Agent, request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { StringDecoder } from "node:string_decoder";
import * as zlib from "node:zlib";
import { sseData, wireMeter, type Harness, type RequestRecord, type WireUsage } from "@openmaxxing/core";

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
  const report = (final: boolean) => {
    const usage = meter.result();
    if (usage && !reported && (final || meter.terminal())) {
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
      report(false);
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
      report(true);
    },
  };
}

export interface Forward {
  target: string;
  harness: Harness;
  user?: string;
}

export function joinUrl(base: string, path: string): string {
  const url = new URL(base);
  return `${url.origin}${url.pathname.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createProxy(options: { session: string; onRecord: (record: RequestRecord) => void }) {
  const agent = new Agent({ keepAlive: true });
  let inFlight = 0;
  let wake: (() => void) | undefined;
  return {
    forward(req: IncomingMessage, res: ServerResponse, { target: url, harness, user }: Forward): void {
      inFlight++;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        inFlight--;
        if (inFlight === 0) wake?.();
      };
      const target = new URL(url);
      const sessionHeader = req.headers["x-claude-code-session-id"] ?? req.headers["session-id"];
      const session = typeof sessionHeader === "string" && sessionHeader ? sessionHeader : options.session;
      const https = target.protocol === "https:";
      const upstream = (https ? httpsRequest : httpRequest)(
        target,
        { method: req.method, headers: { ...req.headers, host: target.host }, agent: https ? agent : undefined },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.statusMessage, response.headers);
          res.flushHeaders();
          const meter = meterResponse(response.headers, (usage) => {
            if ((response.statusCode ?? 500) >= 400) return;
            const requestId = response.headers["request-id"];
            options.onRecord({
              id: (typeof requestId === "string" ? requestId : undefined) ?? usage.id ?? `${session}:${Date.now()}`,
              harness,
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
          res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: `openmaxxing proxy: ${error.message}` } }));
        } else res.destroy();
        done();
      });
      res.on("close", () => {
        if (!res.writableFinished) upstream.destroy();
      });
      req.pipe(upstream);
    },
    async drain(timeoutMs: number): Promise<void> {
      if (inFlight === 0) return;
      await Promise.race([
        new Promise<void>((resolve) => (wake = resolve)),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
      ]);
    },
    destroy(): void {
      agent.destroy();
    },
  };
}

export async function listen(handler: RequestListener, port = 0, host = "127.0.0.1") {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const bound = (server.address() as AddressInfo).port;
  return {
    url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${bound}`,
    close(): Promise<void> {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

export async function startProxy(options: {
  harness: Harness;
  session: string;
  route: (req: IncomingMessage) => string;
  onRecord: (record: RequestRecord) => void;
}) {
  const proxy = createProxy(options);
  const server = await listen((req, res) => proxy.forward(req, res, { target: options.route(req), harness: options.harness }));
  return {
    url: server.url,
    drain: proxy.drain,
    async close(): Promise<void> {
      proxy.destroy();
      await server.close();
    },
  };
}
