import { buildReport, count, exactUsd, usd, type PriceBook, type RequestRecord, type TeamTotals } from "@costmaxxing/core";

export interface StepUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface Tally {
  requests: number;
  price: number;
  alt: number;
}

export const NONE: Tally = { requests: 0, price: 0, alt: 0 };

export function add(a: Tally, b: Tally): Tally {
  return { requests: a.requests + b.requests, price: a.price + b.price, alt: a.alt + b.alt };
}

const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function asTally(value: unknown): Tally {
  const v = (value ?? {}) as Record<string, unknown>;
  return { requests: finite(v.requests), price: finite(v.price), alt: finite(v.alt) };
}

export function asTeam(text: string): TeamTotals | undefined {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof v?.price !== "number" || typeof v.alt !== "number") return undefined;
  return { ...asTally(v), days: finite(v.days), people: finite(v.people) };
}

export function stepRecord(usage: StepUsage, step: { id: string; session: string; subagent: boolean; time: number }): RequestRecord {
  return {
    ...step,
    harness: "Claude Code",
    model: usage.model,
    tokens: {
      uncached: finite(usage.input_tokens),
      output: finite(usage.output_tokens),
      cacheRead: finite(usage.cache_read_input_tokens),
      write5m: finite(usage.cache_creation_input_tokens),
      write1h: 0,
    },
  };
}

export function priceRecord(record: RequestRecord, book: PriceBook): Tally {
  const { hero } = buildReport({ dataset: { kind: "logs", records: [record], days: 1, now: record.time }, book });
  return { requests: 1, price: hero.price, alt: hero.alt };
}

export function localDay(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function savings(t: Tally): string {
  const n = t.price - t.alt;
  return Math.abs(n) < 100 ? exactUsd(n) : usd(n);
}

export function statusText(session: Tally, month: Tally, team: TeamTotals | "unreachable" | undefined): string {
  const parts = [`session ${savings(session)}`, `30 days ${savings(month)}`];
  if (team === "unreachable") parts.push("team server unreachable");
  else if (team) parts.push(`team ${savings(team)} (${count(team.people)} ${team.people === 1 ? "person" : "people"})`);
  return `costmaxxing · open-weight savings: ${parts.join(" · ")}`;
}
