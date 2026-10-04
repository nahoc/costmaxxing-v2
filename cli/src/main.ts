import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  buildReport,
  parseMembers,
  parseSpendReport,
  priceBook,
  renderTerminal,
  spendReportPeriod,
  type Billing,
  type PriceBook,
  type Report,
  type SeatCount,
} from "@costmaxxing/core";
import { loadCatalog } from "./catalog.ts";
import { loadConfig, type Config } from "./config.ts";
import { readUsage } from "./usage.ts";

const DAY = 86_400_000;

const HELP = `costmaxxing: what your AI usage costs at API prices, and what it would cost on open-weight models

  costmaxxing [--days N] [--vs provider/model]... [--json] [--offline] [--config PATH]
  costmaxxing import <spend-report.csv> [--members members.csv] [--seats premium=N,standard=N]
                     [--billing monthly|annual] [--from YYYY-MM-DD --to YYYY-MM-DD]
  costmaxxing claude [args…]     run Claude Code through a local counting proxy
  costmaxxing codex [args…]      run Codex through a local counting proxy
  costmaxxing web                open the report on 127.0.0.1
  costmaxxing serve --token T    run a shared team gateway
  costmaxxing connect <url> --token T [--user NAME]   print agent settings for a gateway
`;

const COMMON = {
  vs: { type: "string", multiple: true },
  json: { type: "boolean" },
  offline: { type: "boolean" },
  config: { type: "string" },
  help: { type: "boolean", short: "h" },
} satisfies ParseArgsConfig["options"];

export const interactive = () => Boolean(process.stdout.isTTY) && !process.env.CI;

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

export async function prices(config: Config, offline: boolean | undefined, vs: string[] = []): Promise<PriceBook> {
  const { prices } = await loadCatalog(Boolean(offline));
  const book = priceBook(prices, config.prices);
  for (const ref of vs) {
    if (!book.has(ref)) throw new Error(`no price for ${ref}. Use a models.dev provider/model ID, like togetherai/zai-org/GLM-5.3`);
  }
  return book;
}

function positiveInteger(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} takes a whole number, not ${value}`);
  return n;
}

async function reportCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { ...COMMON, days: { type: "string" }, version: { type: "boolean" } } });
  if (values.help) return void process.stdout.write(HELP);
  const config = await loadConfig(values.config);
  const days = values.days ? positiveInteger(values.days, "--days") : (config.windowDays ?? 30);
  const now = Date.now();
  const [records, book] = await Promise.all([readUsage(now - days * DAY), prices(config, values.offline, values.vs)]);
  const report = buildReport({
    dataset: { kind: "logs", records, days, now },
    book,
    vs: values.vs,
    scenarios: config.scenarios,
    plan: config.plan,
  });
  if (report.requests === 0 && !values.json) {
    process.stdout.write(
      `No Claude Code or Codex usage in the last ${days} days.\n` +
        "costmaxxing reads ~/.claude/projects and ~/.codex/sessions ($CLAUDE_CONFIG_DIR and $CODEX_HOME move them).\n" +
        `Run ${command()} claude or ${command()} codex to count a session as it happens.\n`,
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

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
      "import takes one spend report CSV. A claude.ai Owner can save it with the costmaxxing browser extension (Download CSV).",
    );
  }
  const period =
    values.from || values.to ? { from: values.from ?? "", to: values.to ?? "" } : spendReportPeriod(basename(file));
  if (!period || !DATE.test(period.from) || !DATE.test(period.to) || period.from > period.to) {
    throw new Error("the CSV has no dates in its name. Pass --from YYYY-MM-DD --to YYYY-MM-DD");
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
  const report = buildReport({
    dataset: { kind: "spend", rows: parseSpendReport(text), ...period },
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
    default:
      return reportCommand(argv);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`costmaxxing: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
