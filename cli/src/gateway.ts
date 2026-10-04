import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { userInfo } from "node:os";
import { join } from "node:path";
import { buildReport, renderPage, type Report } from "@costmaxxing/core";
import { loadConfig } from "./config.ts";
import { prices } from "./prices.ts";
import { createProxy, joinUrl, listen, type Forward } from "./proxy.ts";
import { appendRecord, HOME, readRecorded } from "./usage.ts";

const DAY = 86_400_000;
export const GATEWAY_FILE = join(HOME, "gateway.jsonl");

export const UPSTREAMS = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  chatgpt: "https://chatgpt.com/backend-api/codex",
};

function same(given: string | undefined, token: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return given !== undefined && timingSafeEqual(digest(given), digest(token));
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function basicPassword(req: IncomingMessage): string | undefined {
  const auth = header(req, "authorization");
  if (!auth?.startsWith("Basic ")) return undefined;
  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  return decoded.slice(decoded.indexOf(":") + 1);
}

export function gatewayHandler(options: {
  token: string;
  forward: (req: IncomingMessage, res: ServerResponse, forward: Forward) => void;
  dashboard: () => Promise<string>;
  upstreams?: typeof UPSTREAMS;
}): RequestListener {
  const upstreams = options.upstreams ?? UPSTREAMS;
  return (req, res) => {
    const url = req.url ?? "/";
    const route = /^\/(anthropic|openai)(?=\/|\?|$)/.exec(url)?.[1];
    if (route) {
      if (!same(header(req, "x-costmaxxing-token"), options.token)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "costmaxxing gateway: missing or wrong x-costmaxxing-token" } }));
        return;
      }
      const base = route === "anthropic" ? upstreams.anthropic : header(req, "chatgpt-account-id") ? upstreams.chatgpt : upstreams.openai;
      options.forward(req, res, {
        target: joinUrl(base, url.slice(route.length + 1) || "/"),
        harness: route === "anthropic" ? "Claude Code" : "Codex",
        user: header(req, "x-costmaxxing-user") ?? "unknown",
      });
      return;
    }
    if (req.method === "GET" && (url === "/" || url.startsWith("/?"))) {
      if (!same(basicPassword(req), options.token)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="costmaxxing", charset="UTF-8"' }).end("Use any user name and the gateway token as the password.\n");
        return;
      }
      options.dashboard().then(
        (html) => res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html),
        (error: unknown) => res.writeHead(500, { "content-type": "text/plain" }).end(error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    res.writeHead(404).end();
  };
}

async function gatewayReport(config?: string): Promise<Report> {
  const settings = await loadConfig(config);
  const days = settings.windowDays ?? 30;
  const now = Date.now();
  const [records, book] = await Promise.all([readRecorded(now - days * DAY, GATEWAY_FILE), prices(settings, false)]);
  return buildReport({ dataset: { kind: "logs", records, days, now }, book, scenarios: settings.scenarios });
}

export async function serve(options: { token?: string; port?: string; host?: string; config?: string }): Promise<void> {
  const token = options.token;
  if (!token || token.length < 12) {
    throw new Error("serve needs --token with at least 12 characters. Everyone who connects uses the same token.");
  }
  const proxy = createProxy({ session: "gateway", onRecord: (record) => void appendRecord(record, GATEWAY_FILE).catch(() => undefined) });
  const host = options.host ?? "0.0.0.0";
  const port = options.port ? Number(options.port) : 8787;
  const server = await listen(
    gatewayHandler({ token, forward: proxy.forward, dashboard: async () => renderPage(await gatewayReport(options.config)) }),
    port,
    host,
  );
  const bound = new URL(server.url).port;
  process.stdout.write(
    `costmaxxing serve: listening on ${host}:${bound}\n` +
      `Team members run: npx costmaxxing connect http://<this machine>:${bound} --token <token> --user <name>\n` +
      `Dashboard: ${server.url}/ (any user name, the token as the password)\n`,
  );
}

export function connectSettings(url: string, token: string, user = userInfo().username): string {
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    throw new Error(`connect takes the gateway URL, like http://gateway.local:8787, not ${url}`);
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("the gateway URL starts with http:// or https://");
  const root = `${base.origin}${base.pathname.replace(/\/$/, "")}`;
  const claude = {
    env: {
      ANTHROPIC_BASE_URL: `${root}/anthropic`,
      ANTHROPIC_CUSTOM_HEADERS: `x-costmaxxing-token: ${token}\nx-costmaxxing-user: ${user}`,
    },
  };
  return [
    "Claude Code: merge this into ~/.claude/settings.json (if you already set ANTHROPIC_CUSTOM_HEADERS, add these two lines to it):",
    "",
    JSON.stringify(claude, null, 2),
    "",
    "Codex: add this to ~/.codex/config.toml:",
    "",
    'model_provider = "costmaxxing"',
    "",
    "[model_providers.costmaxxing]",
    'name = "OpenAI via costmaxxing"',
    `base_url = ${JSON.stringify(`${root}/openai`)}`,
    "requires_openai_auth = true",
    'wire_api = "responses"',
    `http_headers = { "x-costmaxxing-token" = ${JSON.stringify(token)}, "x-costmaxxing-user" = ${JSON.stringify(user)} }`,
    "",
  ].join("\n");
}
