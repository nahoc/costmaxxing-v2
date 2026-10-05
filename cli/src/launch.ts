import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { constants, homedir } from "node:os";
import { join } from "node:path";
import { buildReport, plural, savingsText, usd, type PriceBook, type RequestRecord } from "@costmaxxing/core";
import { parse } from "smol-toml";
import { loadConfig } from "./config.ts";
import { prices } from "./prices.ts";
import { joinUrl, startProxy } from "./proxy.ts";
import { appendRecord } from "./usage.ts";

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function claudeBaseUrl(): Promise<string> {
  const user = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
  for (const file of [".claude/settings.local.json", ".claude/settings.json", user]) {
    const env = (await readJson(file))?.env;
    const url = typeof env === "object" && env !== null && "ANTHROPIC_BASE_URL" in env ? env.ANTHROPIC_BASE_URL : undefined;
    if (typeof url === "string" && url) return url;
  }
  return process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}

export function openaiBase(req: IncomingMessage): string {
  return req.headers["chatgpt-account-id"] ? "https://chatgpt.com/backend-api/codex" : "https://api.openai.com/v1";
}

async function codexSetup(): Promise<{ provider?: string; upstream?: string }> {
  const file = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml");
  let config: Record<string, unknown> = {};
  try {
    config = parse(await readFile(file, "utf8"));
  } catch {}
  const provider = typeof config.model_provider === "string" ? config.model_provider : undefined;
  const upstream = typeof config.openai_base_url === "string" ? config.openai_base_url : process.env.OPENAI_BASE_URL || undefined;
  return { provider: provider === "openai" ? undefined : provider, upstream };
}

function summary(records: RequestRecord[], book: PriceBook): string {
  if (records.length === 0) return "costmaxxing · no requests counted";
  const now = Date.now();
  const report = buildReport({ dataset: { kind: "logs", records, days: 3650, now }, book });
  const { hero } = report;
  return `costmaxxing · ${plural(report.requests, "request")} · ${plural(report.tokens, "token")} · ${usd(hero.price)} at API prices, ${usd(hero.alt)} on ${hero.name} (${savingsText(hero.price, hero.alt)})`;
}

export async function launch(agent: "claude" | "codex", args: string[]): Promise<void> {
  const session = `costmaxxing-${randomUUID()}`;
  const counted: RequestRecord[] = [];
  const writes: Promise<void>[] = [];
  const book = loadConfig(undefined).then((config) => prices(config, false));
  book.catch(() => undefined);

  let childArgs = args;
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const onRecord = (record: RequestRecord) => {
    counted.push(record);
    writes.push(appendRecord(record).catch(() => undefined));
  };
  if (agent === "claude") {
    const upstream = await claudeBaseUrl();
    proxy = await startProxy({ harness: "Claude Code", session, route: (req) => joinUrl(upstream, req.url ?? "/"), onRecord });
    childArgs = ["--settings", JSON.stringify({ env: { ANTHROPIC_BASE_URL: proxy.url } }), ...args];
  } else {
    const { provider, upstream } = await codexSetup();
    if (provider) {
      process.stderr.write(
        `costmaxxing: Codex uses the ${provider} provider, so this session is counted from its logs, not live\n`,
      );
    } else {
      proxy = await startProxy({
        harness: "Codex",
        session,
        route: (req) => joinUrl(upstream ?? openaiBase(req), req.url ?? "/"),
        onRecord,
      });
      childArgs = [
        "-c",
        'model_provider="costmaxxing"',
        "-c",
        'model_providers.costmaxxing.name="OpenAI via costmaxxing"',
        "-c",
        `model_providers.costmaxxing.base_url="${proxy.url}"`,
        "-c",
        "model_providers.costmaxxing.requires_openai_auth=true",
        "-c",
        'model_providers.costmaxxing.wire_api="responses"',
        ...args,
      ];
    }
  }

  const child = spawn(agent, childArgs, { stdio: "inherit" });
  // Ctrl-C reaches the agent from the terminal; stay alive to drain the proxy and print the summary.
  process.on("SIGINT", () => {});
  for (const signal of ["SIGTERM", "SIGHUP"] as const) process.on(signal, () => child.kill(signal));
  let exit: [number | null, NodeJS.Signals | null];
  try {
    exit = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
  } catch (error) {
    throw new Error(`can't start ${agent}: ${(error as Error).message}`);
  }

  await proxy?.drain(10_000);
  await proxy?.close();
  await Promise.all(writes);
  if (proxy) {
    const line = await book.then((b) => summary(counted, b)).catch(() => `costmaxxing · ${counted.length} requests counted`);
    process.stderr.write(`\n${line}\n`);
  }
  const [code, signal] = exit;
  process.exitCode = code ?? 128 + (signal ? constants.signals[signal] : 0);
}
