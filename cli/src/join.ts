import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { join as joinPath } from "node:path";
import { createInterface } from "node:readline/promises";
import { addTokens, codexParser, exactUsd, ZERO, type RequestRecord, type TeamPricing, type TeamTotals } from "@costmaxxing/core";
import { loadConfig } from "./config.ts";
import { HOME, readLogs } from "./usage.ts";

const CODEX_HOME = () => process.env.CODEX_HOME ?? joinPath(homedir(), ".codex");
const TEAM_FILE = () => joinPath(HOME, "team.json");
const SENT_FILE = () => joinPath(HOME, "codex-sent.json");

const MOD_VERSION = [2, 1, 287];
const DAY = 86_400_000;

const BASE = () => process.env.COSTMAXXING_URL ?? "https://costmaxxing.dev";

export function teamId(raw: string): string | undefined {
  const id = raw.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?-[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/.test(id) ? id : undefined;
}

export async function startTeam(name: string): Promise<string> {
  const config = await loadConfig(undefined);
  const scenario = config.scenarios[0];
  const pricing: TeamPricing = {
    ...(scenario && { scenario }),
    ...(Object.keys(config.prices).length > 0 && { prices: config.prices }),
  };
  const response = await fetch(`${BASE()}/api/teams`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pricing }),
  });
  if (!response.ok) throw new Error(`${BASE()} answered ${response.status} when starting the team. Try again in a minute.`);
  return ((await response.json()) as { id: string }).id;
}

export function tooOld(version: string): boolean {
  const parts = /(\d+)\.(\d+)\.(\d+)/.exec(version)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if ((parts[i] ?? 0) !== MOD_VERSION[i]) return (parts[i] ?? 0) < (MOD_VERSION[i] ?? 0);
  return false;
}

export function daySessions(records: RequestRecord[]): Record<string, string[]> {
  const days: Record<string, Set<string>> = {};
  for (const record of records) {
    if (!record.session) continue;
    const day = new Date(record.time).toISOString().slice(0, 10);
    (days[day] ??= new Set()).add(record.session);
  }
  return Object.fromEntries(Object.entries(days).map(([day, ids]) => [day, [...ids]]));
}

export function dailySums(records: RequestRecord[]): RequestRecord[] {
  const sums = new Map<string, RequestRecord>();
  for (const record of records) {
    const day = new Date(record.time).toISOString().slice(0, 10);
    const id = `${day}|${record.harness}|${record.model}|${record.subagent ? 1 : 0}`;
    const sum = sums.get(id) ?? {
      id,
      harness: record.harness,
      model: record.model,
      time: Date.parse(`${day}T12:00:00Z`),
      session: "",
      subagent: record.subagent,
      requests: 0,
      tokens: ZERO,
    };
    sums.set(id, { ...sum, requests: (sum.requests ?? 0) + (record.requests ?? 1), tokens: addTokens(sum.tokens, record.tokens) });
  }
  return [...sums.values()];
}

async function whoAmI(team: string): Promise<string> {
  const config = joinPath(process.env.CLAUDE_CONFIG_DIR ?? homedir(), ".claude.json");
  let id = `${userInfo().username}@${hostname()}`;
  try {
    const email = JSON.parse(await readFile(config, "utf8"))?.oauthAccount?.emailAddress;
    if (typeof email === "string" && email.includes("@")) id = email.toLowerCase();
  } catch {}
  return createHash("sha256").update(`${team}:${id}`).digest("hex").slice(0, 16);
}

function claude(args: string[], input?: string): string {
  return execFileSync(process.env.COSTMAXXING_CLAUDE ?? "claude", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
  rl.close();
  return answer === "" || answer === "y" || answer === "yes";
}

export async function joinTeam(raw: string, interactive: boolean, started = false): Promise<void> {
  const team = teamId(raw);
  if (!team) throw new Error(`${raw} isn't a team ID. Team IDs look like acme-7kq3x-m9pz2. Run npx costmaxxing to start a team.`);
  const say = (line: string) => process.stdout.write(`${line}\n`);
  const base = BASE();
  const found = await fetch(`${base}/api/teams/${team}`).catch(() => undefined);
  if (found?.status === 404) throw new Error(`no team has the ID ${team}. Check it, or run npx costmaxxing to start a team.`);
  if (!found?.ok) throw new Error(`couldn't reach ${base}${found ? ` (${found.status})` : ""}. Try again in a minute.`);
  const { name } = (await found.json()) as { name: string };

  let version: string;
  try {
    version = claude(["--version"]).trim();
  } catch {
    throw new Error("Claude Code isn't installed, or `claude` isn't on your PATH. Install it from https://claude.com/claude-code, then run this again.");
  }
  if (tooOld(version)) {
    if (!interactive || !(await confirm(`costmaxxing needs Claude Code 2.1.287 or later, and you have ${version}. Update it now?`))) {
      throw new Error(`costmaxxing needs Claude Code 2.1.287 or later, and you have ${version}. Run claude update, then this again.`);
    }
    say("Updating Claude Code…");
    claude(["update"]);
  }

  const user = await whoAmI(team);
  say("Installing the costmaxxing mod for Claude Code…");
  claude(["plugin", "marketplace", "add", "nahoc/costmaxxing-v2"]);
  claude(["plugin", "marketplace", "update", "costmaxxing"]);
  claude(["plugin", "install", "costmaxxing@costmaxxing"]);
  claude(["plugin", "update", "costmaxxing@costmaxxing"]);
  claude(["plugin", "configure", "costmaxxing@costmaxxing", "--values-stdin"], JSON.stringify({ team, user }));

  const now = Date.now();
  const history = await readLogs(now - 366 * DAY);
  const sums = dailySums(history);
  const codex = await installCodexHook(team, user, now);
  say(`Adding your Claude Code history to ${name}…`);
  const response = await fetch(`${base}/api/teams/${team}/backfill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user, records: sums, sessions: daySessions(history) }),
  });
  if (!response.ok) throw new Error(`${base} answered ${response.status} to the history upload. The mod is installed and will count new usage.`);
  const totals = (await response.json()) as TeamTotals & { counted: number };
  const oldest = Math.min(...sums.map((s) => s.time));
  const days = sums.length > 0 ? Math.round((now - oldest) / DAY) + 1 : 0;
  say("");
  say(`costmaxxing is on for ${name}.`);
  say(
    totals.counted > 0
      ? `Your logs covered ${days} days and ${totals.counted.toLocaleString("en-US")} requests. The team's last 30 days: ${exactUsd(totals.price)} at API prices, ${exactUsd(totals.alt)} on open-weight models.`
      : "Your Claude Code logs had no history to add. New usage counts from now on.",
  );
  say("Restart Claude Code to see the savings under the prompt. They keep counting in every session from now on.");
  if (codex) say("Codex counts too: it will ask you once to trust the costmaxxing hook.");
  say(`Team page: ${base}/${team}`);
  say(started ? `Share this with your team: npx costmaxxing ${team}` : `Teammates join with: npx costmaxxing ${team}`);
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

type HookGroup = { hooks?: { command?: string }[] };

export async function installCodexHook(team: string, user: string, now: number): Promise<boolean> {
  await mkdir(HOME, { recursive: true });
  await writeFile(TEAM_FILE(), `${JSON.stringify({ id: team, user, joined: now })}\n`);
  if (!(await exists(CODEX_HOME()))) return false;
  let script = process.argv[1] ?? "";
  if (script.endsWith(".js")) {
    const copy = joinPath(HOME, "costmaxxing.js");
    await copyFile(script, copy);
    script = copy;
  }
  const command = `'${process.execPath}' '${script}' codex-hook`;
  const file = joinPath(CODEX_HOME(), "hooks.json");
  const config = await readJson<{ hooks?: Record<string, HookGroup[]> }>(file, {});
  const hooks = config.hooks ?? {};
  const stop = (hooks.Stop ?? []).filter((group) => !group.hooks?.some((h) => h.command?.includes(" codex-hook") && h.command.includes("costmaxxing")));
  hooks.Stop = [...stop, { hooks: [{ type: "command", command, async: true, timeout: 30 } as { command: string }] }];
  await writeFile(file, `${JSON.stringify({ ...config, hooks }, null, 2)}\n`);
  return true;
}

export async function codexHook(input: string): Promise<void> {
  const event = JSON.parse(input || "{}") as { transcript_path?: string | null };
  const team = await readJson<{ id?: string; user?: string; joined?: number }>(TEAM_FILE(), {});
  const path = event.transcript_path;
  if (!path || !team.id || !team.user) return;
  const parser = codexParser();
  for (const line of (await readFile(path, "utf8")).split("\n")) parser.line(line);
  const sent = await readJson<Record<string, number>>(SENT_FILE(), {});
  const fresh = parser.records.slice(sent[path] ?? 0).filter((r) => r.time >= (team.joined ?? 0));
  if (fresh.length > 0) {
    const response = await fetch(`${BASE()}/api/teams/${team.id}/usage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: team.user, records: fresh }),
    });
    if (!response.ok) return;
  }
  sent[path] = parser.records.length;
  const recent = Object.fromEntries(Object.entries(sent).slice(-200));
  await writeFile(SENT_FILE(), JSON.stringify(recent));
}
