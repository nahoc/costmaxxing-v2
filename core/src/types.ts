export interface Tokens {
  uncached: number;
  output: number;
  cacheRead: number;
  write5m: number;
  write1h: number;
}

export type Harness = "Claude Code" | "Codex";

export interface RequestRecord {
  id: string;
  harness: Harness;
  model: string;
  time: number;
  session: string;
  subagent: boolean;
  tokens: Tokens;
  user?: string;
  requests?: number;
}

export interface SpendRow {
  user: string;
  product: string;
  model: string;
  requests: number;
  tokens: Tokens;
}

export type Dataset =
  | { kind: "logs"; records: RequestRecord[]; days: number; now: number }
  | { kind: "spend"; rows: SpendRow[]; from: string; to: string; org?: string; recent?: boolean };

export interface Rates {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
}

export interface ModelPrice {
  ref: string;
  provider: string;
  name: string;
  rates: Rates;
  tiers: { size: number; rates: Rates }[];
}

export type PriceBook = ReadonlyMap<string, ModelPrice>;

export const ZERO: Tokens = { uncached: 0, output: 0, cacheRead: 0, write5m: 0, write1h: 0 };

export function addTokens(a: Tokens, b: Tokens): Tokens {
  return {
    uncached: a.uncached + b.uncached,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    write5m: a.write5m + b.write5m,
    write1h: a.write1h + b.write1h,
  };
}

export function promptTokens(t: Tokens): number {
  return t.uncached + t.cacheRead + t.write5m + t.write1h;
}

export function totalTokens(t: Tokens): number {
  return promptTokens(t) + t.output;
}
