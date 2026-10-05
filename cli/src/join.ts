import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { join as joinPath } from "node:path";
import { createInterface } from "node:readline/promises";
import { addTokens, exactUsd, ZERO, type RequestRecord, type TeamTotals } from "@openmaxxing/core";
import { readLogs } from "./usage.ts";

const MOD_VERSION = [2, 1, 287];
const DAY = 86_400_000;

export function teamName(raw: string): string | undefined {
  const name = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(name) && name !== "api" ? name : undefined;
}

export function tooOld(version: string): boolean {
  const parts = /(\d+)\.(\d+)\.(\d+)/.exec(version)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if ((parts[i] ?? 0) !== MOD_VERSION[i]) return (parts[i] ?? 0) < (MOD_VERSION[i] ?? 0);
  return false;
}

export function dailySums(records: RequestRecord[]): RequestRecord[] {
  const sums = new Map<string, RequestRecord>();
  for (const record of records) {
    if (record.harness !== "Claude Code") continue;
    const day = new Date(record.time).toISOString().slice(0, 10);
    const id = `${day}|${record.model}|${record.subagent ? 1 : 0}`;
    const sum = sums.get(id) ?? {
      id,
      harness: "Claude Code" as const,
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
  return execFileSync(process.env.OPENMAXXING_CLAUDE ?? "claude", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
  rl.close();
  return answer === "" || answer === "y" || answer === "yes";
}

export async function joinTeam(raw: string, interactive: boolean): Promise<void> {
  const team = teamName(raw);
  if (!team) throw new Error(`${raw} isn't a team name. Use 3 to 40 lowercase letters, digits, or dashes, like npx openmaxxing acme`);
  const say = (line: string) => process.stdout.write(`${line}\n`);

  let version: string;
  try {
    version = claude(["--version"]).trim();
  } catch {
    throw new Error("Claude Code isn't installed, or `claude` isn't on your PATH. Install it from https://claude.com/claude-code, then run this again.");
  }
  if (tooOld(version)) {
    if (!interactive || !(await confirm(`openmaxxing needs Claude Code 2.1.287 or later, and you have ${version}. Update it now?`))) {
      throw new Error(`openmaxxing needs Claude Code 2.1.287 or later, and you have ${version}. Run claude update, then this again.`);
    }
    say("Updating Claude Code…");
    claude(["update"]);
  }

  const user = await whoAmI(team);
  say("Installing the openmaxxing mod for Claude Code…");
  claude(["plugin", "marketplace", "add", "nahoc/openmaxxing"]);
  claude(["plugin", "marketplace", "update", "openmaxxing"]);
  claude(["plugin", "install", "openmaxxing@openmaxxing"]);
  claude(["plugin", "update", "openmaxxing@openmaxxing"]);
  claude(["plugin", "configure", "openmaxxing@openmaxxing", "--values-stdin"], JSON.stringify({ team, user }));

  const base = process.env.OPENMAXXING_URL ?? "https://costmaxxing.dev";
  const now = Date.now();
  const sums = dailySums(await readLogs(now - 366 * DAY));
  say(`Adding your Claude Code history to ${team}…`);
  const response = await fetch(`${base}/api/teams/${team}/backfill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user, records: sums }),
  });
  if (!response.ok) throw new Error(`${base} answered ${response.status} to the history upload. The mod is installed and will count new usage.`);
  const totals = (await response.json()) as TeamTotals & { counted: number };
  const oldest = Math.min(...sums.map((s) => s.time));
  const days = sums.length > 0 ? Math.round((now - oldest) / DAY) + 1 : 0;
  say("");
  say(`openmaxxing is on for ${team}.`);
  say(
    totals.counted > 0
      ? `Your logs covered ${days} days and ${totals.counted.toLocaleString("en-US")} requests. The team's last 30 days: ${exactUsd(totals.price)} at API prices, ${exactUsd(totals.alt)} on open-weight models.`
      : "Your Claude Code logs had no history to add. New usage counts from now on.",
  );
  say("Restart Claude Code to see the savings under the prompt. They keep counting in every session from now on.");
  say(`Team page: ${base}/${team}`);
}
