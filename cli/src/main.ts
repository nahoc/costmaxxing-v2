import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  buildReport,
  parseMembers,
  parseSpendReport,
  renderTerminal,
  spendReportPeriod,
  type Billing,
  type Report,
  type SeatCount,
} from "@costmaxxing/core";
import pkg from "../package.json" with { type: "json" };
import { loadConfig } from "./config.ts";
import { connectSettings, serve } from "./gateway.ts";
import { createInterface } from "node:readline/promises";
import { ask, dim, openBrowser } from "./ui.ts";
import { adminTeam, codexHook, connections, currentTeam, describeTeam, joinTeam, leaveTeam, startTeam } from "./join.ts";
import { personalReport } from "./personal.ts";
import { prices } from "./prices.ts";

const HELP = `costmaxxing: what your AI usage costs at API prices, and what it would cost on open-weight models

  costmaxxing [--days N] [--vs provider/model]... [--json] [--offline] [--config PATH]
  costmaxxing <team-id>          add your Claude Code to a team's savings at costmaxxing.dev/<team-id>
  costmaxxing team               show your team's page link and totals, and open it
  costmaxxing team leave         leave your team: the mod goes back to your own numbers
  costmaxxing team rotate        (team starter) move the team to a new ID; members follow
  costmaxxing team pricing       (team starter) set the team's comparison from your config file
  costmaxxing team delete        (team starter) delete the team and all its usage
  costmaxxing import <spend-report.csv> [--members members.csv] [--seats premium=N,standard=N]
                     [--billing monthly|annual] [--from YYYY-MM-DD --to YYYY-MM-DD]
  costmaxxing serve --token T [--port 8787] [--host 0.0.0.0]   run a shared team gateway
  costmaxxing connect <url> --token T [--user NAME]   print agent settings for a gateway
`;

const COMMON = {
  vs: { type: "string", multiple: true },
  json: { type: "boolean" },
  offline: { type: "boolean" },
  config: { type: "string" },
  help: { type: "boolean", short: "h" },
} satisfies ParseArgsConfig["options"];

const interactive = () => Boolean(process.stdout.isTTY) && !process.env.CI;

function command(): string {
  return process.env.npm_command === "exec" ? "npx costmaxxing" : "costmaxxing";
}

function print(report: Report, json: boolean | undefined): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const color = interactive() && !process.env.NO_COLOR;
  process.stdout.write(renderTerminal(report, { color, width: process.stdout.columns || 100, command: command() }));
}

async function reportCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { ...COMMON, days: { type: "string" }, version: { type: "boolean" } } });
  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void process.stdout.write(`${pkg.version}\n`);
  const report = await personalReport(values);
  if (report.requests === 0 && !values.json) {
    process.stdout.write(
      `No Claude Code or Codex usage in the ${report.scope}.\n` +
        "costmaxxing reads ~/.claude/projects and ~/.codex/sessions ($CLAUDE_CONFIG_DIR and $CODEX_HOME move them).\n",
    );
    return;
  }
  print(report, values.json);
}

function parseSeats(value: string): SeatCount {
  const seats: SeatCount = { premium: 0, standard: 0 };
  for (const part of value.split(",")) {
    const [kind, n] = part.split("=");
    if ((kind !== "premium" && kind !== "standard") || n === undefined || !/^\d+$/.test(n)) {
      throw new Error(`--seats takes premium=N,standard=N, not ${value}`);
    }
    seats[kind] = Number(n);
  }
  return seats;
}

function isDate(text: string): boolean {
  const time = Date.parse(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(time) && new Date(time).toISOString().startsWith(text);
}

async function importCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...COMMON,
      members: { type: "string" },
      seats: { type: "string" },
      billing: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
    },
  });
  if (values.help) return void process.stdout.write(HELP);
  const [file, ...extra] = positionals;
  if (!file || extra.length > 0) {
    throw new Error(
      "import takes one spend report CSV, which a claude.ai Owner can download from the organization's usage settings.",
    );
  }
  const period =
    values.from || values.to ? { from: values.from ?? "", to: values.to ?? "" } : spendReportPeriod(basename(file));
  if (!period) throw new Error("the CSV has no dates in its name. Pass --from YYYY-MM-DD --to YYYY-MM-DD");
  if (!isDate(period.from) || !isDate(period.to) || period.from > period.to) {
    throw new Error("--from and --to take real dates as YYYY-MM-DD, with --from on or before --to");
  }
  if (values.billing && values.billing !== "monthly" && values.billing !== "annual") {
    throw new Error(`--billing takes monthly or annual, not ${values.billing}`);
  }
  const billing: Billing = values.billing === "annual" ? "annual" : "monthly";
  let seats: SeatCount | undefined;
  if (values.seats) seats = parseSeats(values.seats);
  else if (values.members) {
    seats = parseMembers(await readFile(values.members, "utf8"));
    if (!seats) process.stderr.write(`costmaxxing: ${values.members} has no email and seat columns, so seats are estimated\n`);
  }
  const config = await loadConfig(values.config);
  const [text, book] = await Promise.all([readFile(file, "utf8"), prices(config, values.offline, values.vs)]);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const recent = period.to >= yesterday.toLocaleDateString("en-CA");
  const report = buildReport({
    dataset: { kind: "spend", rows: parseSpendReport(text), ...period, recent },
    book,
    vs: values.vs,
    scenarios: config.scenarios,
    plan: config.plan,
    seats,
    billing,
  });
  print(report, values.json);
}

async function main(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;
  switch (first) {
    case "import":
      return importCommand(rest);
    case "team": {
      const [sub] = rest;
      if (sub === "leave") return void process.stdout.write(`${await leaveTeam()}\n`);
      if (sub === "rotate" || sub === "delete" || sub === "pricing") {
        if (sub === "delete" && interactive()) {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const sure = (await rl.question("Delete the team and all its usage for everyone? Type delete to confirm: ")).trim();
          rl.close();
          if (sure !== "delete") return void process.stdout.write("Nothing deleted.\n");
        }
        return void process.stdout.write(`${await adminTeam(sub)}\n`);
      }
      const team = await currentTeam();
      if (team === undefined) return void process.stdout.write("You're not on a team. Run npx costmaxxing to start or join one.\n");
      if (team === "gone") return void process.stdout.write("Your saved team no longer exists. Run npx costmaxxing to start or join one.\n");
      process.stdout.write(`${describeTeam(team, await connections(team.id))}\n`);
      if (interactive()) openBrowser(team.url);
      return;
    }
    case "codex-hook": {
      let input = "";
      for await (const chunk of process.stdin) input += chunk;
      return codexHook(input).catch(() => undefined);
    }
    case "serve": {
      const { values } = parseArgs({
        args: rest,
        options: { token: { type: "string" }, port: { type: "string" }, host: { type: "string" }, config: { type: "string" } },
      });
      return serve(values);
    }
    case "connect": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { token: { type: "string" }, user: { type: "string" } },
      });
      const [url] = positionals;
      if (!url || !values.token) throw new Error("connect takes the gateway URL and --token, like connect http://gateway.local:8787 --token T");
      return void process.stdout.write(connectSettings(url, values.token, values.user));
    }
    default:
      if (first && !first.startsWith("-")) return joinTeam(first, interactive());
      if (argv.length === 0 && interactive()) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const team = await currentTeam();
        if (team && team !== "gone") {
          process.stdout.write(`${describeTeam(team, await connections(team.id))}\n\n`);
          const answer = (await rl.question(ask("Open the team page?") + dim("(Enter to open · another team ID to switch · leave to leave) "))).trim();
          rl.close();
          if (answer === "leave") return void process.stdout.write(`${await leaveTeam()}\n`);
          if (answer) return joinTeam(answer, true);
          return openBrowser(team.url);
        }
        if (team === "gone") process.stdout.write("Your saved team no longer exists.\n");
        const id = (await rl.question(ask("Team ID?") + dim("(Enter to start a new team) "))).trim();
        const name = id ? "" : (await rl.question(ask("Team name?") + dim("(like Acme · Enter for just your own report) "))).trim();
        rl.close();
        if (id) return joinTeam(id, true);
        if (name) {
          const started = await startTeam(name);
          return joinTeam(started.id, true, started.admin);
        }
      }
      return reportCommand(argv);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`costmaxxing: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
