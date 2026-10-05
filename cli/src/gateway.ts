import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { userInfo } from "node:os";
import { join } from "node:path";
import { buildReport, parseRecord, renderPage, teamTotals, type Report, type RequestRecord, type TeamTotals } from "@openmaxxing/core";
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

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function usageRecords(req: IncomingMessage, user: string): Promise<RequestRecord[] | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_048_576) return undefined;
    chunks.push(chunk as Buffer);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return undefined;
  }
  const list = (body as { records?: unknown } | null)?.records;
  if (!Array.isArray(list)) return undefined;
  return list.flatMap((entry) => {
    const record = parseRecord(JSON.stringify(entry));
    return record ? [{ ...record, user }] : [];
  });
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
  ingest: (records: RequestRecord[]) => Promise<TeamTotals>;
  upstreams?: typeof UPSTREAMS;
}): RequestListener {
  const upstreams = options.upstreams ?? UPSTREAMS;
  return (req, res) => {
    const url = req.url ?? "/";
    if (url === "/openmaxxing/usage") {
      if (req.method !== "POST") return json(res, 405, { error: "POST token counts here" });
      if (!same(header(req, "x-openmaxxing-token"), options.token)) {
        return json(res, 401, { error: "openmaxxing gateway: missing or wrong x-openmaxxing-token" });
      }
      usageRecords(req, header(req, "x-openmaxxing-user") ?? "unknown")
        .then((records) => (records ? options.ingest(records).then((totals) => json(res, 200, totals)) : json(res, 400, { error: "send {\"records\": [...]} under 1 MB" })))
        .catch((error: unknown) => json(res, 500, { error: error instanceof Error ? error.message : String(error) }));
      return;
    }
    const route = /^\/(anthropic|openai)(?=\/|\?|$)/.exec(url)?.[1];
    if (route) {
      if (!same(header(req, "x-openmaxxing-token"), options.token)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "openmaxxing gateway: missing or wrong x-openmaxxing-token" } }));
        return;
      }
      const user = header(req, "x-openmaxxing-user") ?? "unknown";
      delete req.headers["x-openmaxxing-token"];
      delete req.headers["x-openmaxxing-user"];
      const base = route === "anthropic" ? upstreams.anthropic : header(req, "chatgpt-account-id") ? upstreams.chatgpt : upstreams.openai;
      options.forward(req, res, {
        target: joinUrl(base, url.slice(route.length + 1) || "/"),
        harness: route === "anthropic" ? "Claude Code" : "Codex",
        user,
      });
      return;
    }
    if (req.method === "GET" && (url === "/" || url.startsWith("/?"))) {
      if (!same(basicPassword(req), options.token)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="openmaxxing", charset="UTF-8"' }).end("Use any user name and the gateway token as the password.\n");
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

async function gatewayReport(config: string | undefined, kept: Map<string, RequestRecord>): Promise<Report> {
  const settings = await loadConfig(config);
  const days = settings.windowDays ?? 30;
  const now = Date.now();
  for (const [id, record] of kept) if (record.time < now - days * DAY) kept.delete(id);
  const book = await prices(settings, false);
  return buildReport({ dataset: { kind: "logs", records: [...kept.values()], days, now }, book, scenarios: settings.scenarios });
}

export async function serve(options: { token?: string; port?: string; host?: string; config?: string }): Promise<void> {
  const token = options.token;
  if (!token || token.length < 12) {
    throw new Error("serve needs --token with at least 12 characters. Everyone who connects uses the same token.");
  }
  const settings = await loadConfig(options.config);
  const kept = new Map<string, RequestRecord>();
  for (const record of await readRecorded(Date.now() - (settings.windowDays ?? 30) * DAY, GATEWAY_FILE)) kept.set(record.id, record);
  let totals: { at: number; value: Promise<TeamTotals> } | undefined;
  let changed = true;
  const keep = (record: RequestRecord) => {
    kept.set(record.id, record);
    changed = true;
  };
  const proxy = createProxy({
    session: "gateway",
    onRecord: (record) => {
      keep(record);
      void appendRecord(record, GATEWAY_FILE).catch(() => undefined);
    },
  });
  const ingest = async (records: RequestRecord[]) => {
    for (const record of records) {
      keep(record);
      await appendRecord(record, GATEWAY_FILE);
    }
    if (!totals || (changed && Date.now() - totals.at >= 1000)) {
      changed = false;
      totals = { at: Date.now(), value: gatewayReport(options.config, kept).then(teamTotals) };
      totals.value.catch(() => (totals = undefined));
    }
    return totals.value;
  };
  const host = options.host ?? "0.0.0.0";
  const port = options.port ? Number(options.port) : 8787;
  const server = await listen(
    gatewayHandler({ token, forward: proxy.forward, dashboard: async () => renderPage(await gatewayReport(options.config, kept)), ingest }),
    port,
    host,
  );
  const bound = new URL(server.url).port;
  process.stdout.write(
    `openmaxxing serve: listening on ${host}:${bound}\n` +
      `Team members run: npx openmaxxing connect http://<this machine>:${bound} --token <token> --user <name>\n` +
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
      ANTHROPIC_CUSTOM_HEADERS: `x-openmaxxing-token: ${token}\nx-openmaxxing-user: ${user}`,
    },
  };
  return [
    "Claude Code: merge this into ~/.claude/settings.json (if you already set ANTHROPIC_CUSTOM_HEADERS, add these two lines to it):",
    "",
    JSON.stringify(claude, null, 2),
    "",
    "Codex: add this to ~/.codex/config.toml:",
    "",
    'model_provider = "openmaxxing"',
    "",
    "[model_providers.openmaxxing]",
    'name = "OpenAI via openmaxxing"',
    `base_url = ${JSON.stringify(`${root}/openai`)}`,
    "requires_openai_auth = true",
    'wire_api = "responses"',
    `http_headers = { "x-openmaxxing-token" = ${JSON.stringify(token)}, "x-openmaxxing-user" = ${JSON.stringify(user)} }`,
    "",
    "Or, instead of the Claude Code settings above, install the openmaxxing mod (Claude Code v2.1.287 or later).",
    "It shows the savings under the prompt and sends only token counts here. Use one or the other: with both, requests count twice.",
    "",
    "claude plugin marketplace add nahoc/openmaxxing",
    `claude plugin install openmaxxing@openmaxxing --config server=${root} --config token=${token} --config user=${user}`,
    "",
  ].join("\n");
}
