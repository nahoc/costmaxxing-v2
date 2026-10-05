import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Harness, Plan, Rates, Scenario } from "@costmaxxing/core";
import { parse } from "smol-toml";
import { HOME } from "./usage.ts";

export interface Config {
  windowDays?: number;
  plan?: Plan;
  scenarios: Scenario[];
  prices: Record<string, Partial<Rates>>;
}

const CLIENTS: Record<string, Harness> = { "claude-code": "Claude Code", codex: "Codex" };
const RATE_KEYS: Record<string, keyof Rates> = {
  input: "input",
  output: "output",
  cache_read: "cacheRead",
  cache_write: "cacheWrite",
  cache_write_1h: "cacheWrite1h",
};

type Table = Record<string, unknown>;

function table(value: unknown, where: string): Table {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${where} must be a table`);
  return value as Table;
}

function only(t: Table, keys: string[], where: string): void {
  const extra = Object.keys(t).filter((key) => !keys.includes(key));
  if (extra.length > 0) throw new Error(`${where} has unknown key ${extra.join(", ")}`);
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`${where} must be a string`);
  return value;
}

function number(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${where} must be a non-negative number`);
  }
  return value;
}

export function parseConfig(source: string): Config {
  const root = parse(source);
  only(root, ["window_days", "plan", "scenario", "prices"], "config");
  const config: Config = { scenarios: [], prices: {} };
  if (root.window_days !== undefined) {
    const days = number(root.window_days, "window_days");
    if (!Number.isInteger(days) || days < 1) throw new Error("window_days must be a whole number of days");
    config.windowDays = days;
  }
  if (root.plan !== undefined) {
    const plan = table(root.plan, "[plan]");
    only(plan, ["name", "monthly_usd", "clients"], "[plan]");
    config.plan = { name: text(plan.name, "[plan].name"), monthlyUsd: number(plan.monthly_usd, "[plan].monthly_usd") };
    if (plan.clients !== undefined) {
      if (!Array.isArray(plan.clients)) throw new Error("[plan].clients must be a list");
      config.plan.harnesses = plan.clients.map((client) => {
        const harness = CLIENTS[String(client)];
        if (!harness) throw new Error(`[plan].clients: use ${Object.keys(CLIENTS).join(" or ")}, not ${client}`);
        return harness;
      });
    }
  }
  if (root.scenario !== undefined) {
    if (!Array.isArray(root.scenario)) throw new Error("scenario must be an array of tables, [[scenario]]");
    config.scenarios = root.scenario.map((entry, i) => {
      const where = `[[scenario]] ${i + 1}`;
      const scenario = table(entry, where);
      only(scenario, ["name", "map"], where);
      if (!Array.isArray(scenario.map)) throw new Error(`${where}: map must be a list of [pattern, "provider/model"]`);
      return {
        name: text(scenario.name, `${where}.name`),
        routes: scenario.map.map((pair): [string, string] => {
          if (!Array.isArray(pair) || pair.length !== 2) {
            throw new Error(`${where}: each map entry is [pattern, "provider/model"]`);
          }
          return [text(pair[0], `${where}.map pattern`), text(pair[1], `${where}.map model`)];
        }),
      };
    });
  }
  if (root.prices !== undefined) {
    for (const [ref, entry] of Object.entries(table(root.prices, "[prices]"))) {
      const where = `[prices."${ref}"]`;
      const rates = table(entry, where);
      only(rates, Object.keys(RATE_KEYS), where);
      config.prices[ref] = Object.fromEntries(
        Object.entries(rates).map(([key, value]) => [RATE_KEYS[key], number(value, `${where}.${key}`)]),
      );
    }
  }
  return config;
}

export async function loadConfig(path: string | undefined): Promise<Config> {
  const file = path ?? join(HOME, "config.toml");
  let source: string;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    if (path === undefined) return { scenarios: [], prices: {} };
    throw new Error(`can't read ${file}: ${(error as Error).message}`);
  }
  try {
    return parseConfig(source);
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
}
