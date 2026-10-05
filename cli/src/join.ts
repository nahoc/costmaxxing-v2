import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { join as joinPath } from "node:path";
import { createInterface } from "node:readline/promises";
import { addTokens, codexParser, count, exactUsd, ZERO, type RequestRecord, type TeamPricing, type TeamTotals } from "@costmaxxing/core";
import { loadConfig } from "./config.ts";
import { box, bold, dim, green, purple, say, step } from "./ui.ts";
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

async function configPricing(): Promise<TeamPricing> {
  const config = await loadConfig(undefined);
  const scenario = config.scenarios[0];
  return {
    ...(scenario && { scenario }),
    ...(Object.keys(config.prices).length > 0 && { prices: config.prices }),
  };
}

export async function startTeam(name: string): Promise<{ id: string; admin: string }> {
  const pricing = await configPricing();
  const response = await fetch(`${BASE()}/api/teams`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pricing }),
  });
  if (!response.ok) throw new Error(`${BASE()} answered ${response.status} when starting the team. Try again in a minute.`);
  return (await response.json()) as { id: string; admin: string };
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

export async function joinTeam(raw: string, interactive: boolean, admin?: string): Promise<void> {
  const started = admin !== undefined;
  const team = teamId(raw);
  if (!team) throw new Error(`${raw} isn't a team ID. Team IDs look like acme-7kq3x-m9pz2. Run npx costmaxxing to start a team.`);
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
    await step("Claude Code updated", () => claude(["update"]));
  }

  const user = await whoAmI(team);
  say();
  say(`  ${purple("costmaxxing")}  ${dim("·")}  ${bold(name)}`);
  say();
  await step(
    "Mod installed in Claude Code",
    () => {
      claude(["plugin", "marketplace", "add", "nahoc/costmaxxing-v2"]);
      claude(["plugin", "marketplace", "update", "costmaxxing"]);
      claude(["plugin", "install", "costmaxxing@costmaxxing"]);
      claude(["plugin", "update", "costmaxxing@costmaxxing"]);
      claude(["plugin", "configure", "costmaxxing@costmaxxing", "--values-stdin"], JSON.stringify({ team, user }));
    },
    () => "restart Claude Code to see it",
  );
  const now = Date.now();
  const codex = await installCodexHook(team, user, now, admin);
  if (codex) await step("Codex hook added", () => undefined, () => "Codex asks once to trust it");
  const { totals, days } = await step(
    "History added",
    async () => {
      const history = await readLogs(now - 366 * DAY);
      const sums = dailySums(history);
      const response = await fetch(`${base}/api/teams/${team}/backfill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, records: sums, sessions: daySessions(history) }),
      });
      if (!response.ok) throw new Error(`${base} answered ${response.status} to the history upload. The mod is installed and will count new usage.`);
      const oldest = Math.min(...sums.map((s) => s.time));
      return { totals: (await response.json()) as TeamTotals & { counted: number }, days: sums.length > 0 ? Math.round((now - oldest) / DAY) + 1 : 0 };
    },
    (r) => (r.totals.counted > 0 ? `${count(r.days)} days · ${r.totals.counted.toLocaleString("en-US")} requests` : "no earlier usage in your logs"),
  );
  say();
  if (totals.requests > 0) {
    const saved = totals.price - totals.alt;
    say(
      box("Team, last 30 days", [
        `${bold(exactUsd(totals.price))} at API prices`,
        `${bold(exactUsd(totals.alt))} on open-weight models`,
        green(bold(`${exactUsd(saved)} potential savings (${totals.price > 0 ? Math.round((saved / totals.price) * 100) : 0}%)`)),
      ]),
    );
    say();
  }
  say(`  ${dim("Team page".padEnd(12))}${base}/${team}`);
  say(`  ${dim((started ? "Share" : "Invite").padEnd(12))}${bold(`npx costmaxxing ${team}`)}`);
  say();
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

interface SavedTeam {
  id?: string;
  user?: string;
  joined?: number;
  admin?: string;
}

async function saveTeam(team: SavedTeam): Promise<void> {
  await mkdir(HOME, { recursive: true });
  await writeFile(TEAM_FILE(), `${JSON.stringify(team)}\n`);
}

export async function installCodexHook(team: string, user: string, now: number, admin?: string): Promise<boolean> {
  const before = await readJson<SavedTeam>(TEAM_FILE(), {});
  const keep = admin ?? (before.id === team ? before.admin : undefined);
  await saveTeam({ id: team, user, joined: before.id === team ? (before.joined ?? now) : now, ...(keep && { admin: keep }) });
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
  const team = await readJson<SavedTeam>(TEAM_FILE(), {});
  const path = event.transcript_path;
  if (!path || !team.id || !team.user) return;
  const parser = codexParser();
  for (const line of (await readFile(path, "utf8")).split("\n")) parser.line(line);
  const sent = await readJson<Record<string, number>>(SENT_FILE(), {});
  const fresh = parser.records.slice(sent[path] ?? 0).filter((r) => r.time >= (team.joined ?? 0));
  if (fresh.length > 0) {
    const send = (id: string) =>
      fetch(`${BASE()}/api/teams/${id}/usage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: team.user, records: fresh }),
      });
    let response = await send(team.id);
    if (response.status === 410) {
      const { moved } = (await response.json()) as { moved: string };
      await saveTeam({ ...team, id: moved });
      response = await send(moved);
    }
    if (!response.ok) return;
  }
  sent[path] = parser.records.length;
  const recent = Object.fromEntries(Object.entries(sent).slice(-200));
  await writeFile(SENT_FILE(), JSON.stringify(recent));
}

export interface CurrentTeam {
  id: string;
  name: string;
  url: string;
  totals: TeamTotals;
}

async function follow(team: SavedTeam): Promise<string> {
  const id = team.id ?? "";
  if (!team.user) return id;
  const response = await fetch(`${BASE()}/api/teams/${id}/usage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: team.user, records: [] }),
  }).catch(() => undefined);
  if (response?.status !== 410) return id;
  const { moved } = (await response.json()) as { moved: string };
  await saveTeam({ ...team, id: moved });
  return moved;
}

export async function currentTeam(): Promise<CurrentTeam | "gone" | undefined> {
  const saved = await readJson<SavedTeam>(TEAM_FILE(), {});
  if (!saved.id) return undefined;
  const id = await follow(saved);
  const response = await fetch(`${BASE()}/api/teams/${id}`).catch(() => undefined);
  if (response?.status === 404) return "gone";
  const url = `${BASE()}/${id}`;
  if (!response?.ok) return { id, name: id, url, totals: { days: 30, people: 0, requests: 0, price: 0, alt: 0 } };
  const body = (await response.json()) as TeamTotals & { name: string };
  return { id, name: body.name, url, totals: body };
}

export async function adminTeam(action: "rotate" | "delete" | "pricing"): Promise<string> {
  const saved = await readJson<SavedTeam>(TEAM_FILE(), {});
  if (!saved.id) throw new Error("you're not on a team. Run npx costmaxxing to start or join one.");
  if (!saved.admin) throw new Error("only the person who started the team can do this, from the machine they started it on.");
  const response = await fetch(`${BASE()}/api/teams/${saved.id}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${saved.admin}` },
    body: JSON.stringify(action === "pricing" ? { pricing: await configPricing() } : {}),
  });
  if (response.status === 401) throw new Error("the saved admin key doesn't match this team.");
  if (!response.ok) throw new Error(`${BASE()} answered ${response.status}. Try again in a minute.`);
  const body = (await response.json()) as { id?: string; pricing?: TeamPricing | null };
  if (action === "rotate" && body.id) {
    await saveTeam({ ...saved, id: body.id });
    return [
      `New team ID: ${body.id}. Team page: ${BASE()}/${body.id}`,
      "Everyone who already joined follows automatically. Anyone holding only the old ID is locked out.",
      `New teammates join with: npx costmaxxing ${body.id}`,
    ].join("\n");
  }
  if (action === "delete") {
    await saveTeam({});
    return `Deleted ${saved.id} and all its usage. Teammates' Claude Code shows "team ID not found" until they join another team.`;
  }
  return body.pricing?.scenario
    ? `The team now compares against ${body.pricing.scenario.name}, from your config file.`
    : "The team now uses the default open-weight plan (your config file has no [[scenario]]).";
}

export function describeTeam(team: CurrentTeam): string {
  const { totals } = team;
  const saved = totals.price - totals.alt;
  return [
    "",
    `  ${purple("costmaxxing")}  ${dim("·")}  ${bold(team.name)}`,
    "",
    totals.requests > 0
      ? box(`Team, last 30 days · ${totals.people} ${totals.people === 1 ? "person" : "people"}`, [
          `${bold(exactUsd(totals.price))} at API prices`,
          `${bold(exactUsd(totals.alt))} on open-weight models`,
          green(bold(`${exactUsd(saved)} potential savings (${totals.price > 0 ? Math.round((saved / totals.price) * 100) : 0}%)`)),
        ])
      : `  ${dim("No usage on the team page yet.")}`,
    "",
    `  ${dim("Team page".padEnd(12))}${team.url}`,
    `  ${dim("Invite".padEnd(12))}${bold(`npx costmaxxing ${team.id}`)}`,
    "",
  ].join("\n");
}

const isOurHook = (group: HookGroup) => group.hooks?.some((h) => h.command?.includes(" codex-hook") && h.command.includes("costmaxxing"));

export async function leaveTeam(): Promise<string> {
  const saved = await readJson<SavedTeam>(TEAM_FILE(), {});
  const lines: string[] = [];
  try {
    claude(["plugin", "configure", "costmaxxing@costmaxxing", "--values-stdin"], JSON.stringify({ team: "", user: "" }));
    lines.push("Claude Code: the costmaxxing mod is back to your own numbers only. Restart Claude Code to apply it.");
  } catch {
    lines.push("Claude Code: the costmaxxing mod isn't installed, so there was nothing to clear.");
  }
  const hooksFile = joinPath(CODEX_HOME(), "hooks.json");
  const config = await readJson<{ hooks?: Record<string, HookGroup[]> }>(hooksFile, {});
  if (config.hooks?.Stop?.some(isOurHook)) {
    const stop = config.hooks.Stop.filter((group) => !isOurHook(group));
    const hooks = { ...config.hooks };
    if (stop.length > 0) hooks.Stop = stop;
    else delete hooks.Stop;
    await writeFile(hooksFile, `${JSON.stringify({ ...config, hooks }, null, 2)}\n`);
    lines.push("Codex: removed the costmaxxing hook. Your other hooks are untouched.");
  }
  if (saved.admin && saved.id) {
    const backup = joinPath(HOME, `admin-${saved.id}.json`);
    await writeFile(backup, `${JSON.stringify({ id: saved.id, admin: saved.admin })}\n`);
    lines.push(`You started ${saved.id}. Its admin key is kept in ${backup}; copy it back to team.json to rotate or delete the team later.`);
  }
  await rm(TEAM_FILE(), { force: true });
  await rm(SENT_FILE(), { force: true });
  lines.unshift(saved.id ? `Left ${saved.id}.` : "You weren't on a team; cleared any leftovers.");
  return lines.join("\n");
}
