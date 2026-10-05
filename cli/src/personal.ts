import { buildReport, type Report } from "@openmaxxing/core";
import { loadConfig } from "./config.ts";
import { prices } from "./prices.ts";
import { readUsage } from "./usage.ts";

const DAY = 86_400_000;

export interface PersonalOptions {
  days?: string;
  vs?: string[];
  offline?: boolean;
  config?: string;
}

function positiveInteger(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} takes a whole number, not ${value}`);
  return n;
}

export async function personalReport(options: PersonalOptions): Promise<Report> {
  const config = await loadConfig(options.config);
  const days = options.days ? positiveInteger(options.days, "--days") : (config.windowDays ?? 30);
  const now = Date.now();
  const [records, book] = await Promise.all([readUsage(now - days * DAY), prices(config, options.offline, options.vs)]);
  return buildReport({
    dataset: { kind: "logs", records, days, now },
    book,
    vs: options.vs,
    scenarios: config.scenarios,
    plan: config.plan,
  });
}
