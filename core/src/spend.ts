import type { SpendRow } from "./types.ts";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows.filter((r) => r.some((cell) => cell !== ""));
}

const SPEND_COLUMNS = [
  "user_email",
  "product",
  "model",
  "total_requests",
  "total_completion_tokens",
  "total_uncached_input_tokens",
  "total_cache_read_tokens",
  "total_cache_write_5m_tokens",
  "total_cache_write_1h_tokens",
] as const;

export function parseSpendReport(text: string): SpendRow[] {
  const [header = [], ...rows] = parseCsv(text);
  const missing = SPEND_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new Error(`not a claude.ai spend report (missing ${missing.join(", ")})`);
  const cell = (row: string[], name: (typeof SPEND_COLUMNS)[number]) => row[header.indexOf(name)] ?? "";
  const count = (row: string[], name: (typeof SPEND_COLUMNS)[number]) => Number(cell(row, name).replaceAll(",", "")) || 0;
  return rows.map((row) => ({
    user: cell(row, "user_email"),
    product: cell(row, "product"),
    model: cell(row, "model"),
    requests: count(row, "total_requests"),
    tokens: {
      uncached: count(row, "total_uncached_input_tokens"),
      output: count(row, "total_completion_tokens"),
      cacheRead: count(row, "total_cache_read_tokens"),
      write5m: count(row, "total_cache_write_5m_tokens"),
      write1h: count(row, "total_cache_write_1h_tokens"),
    },
  }));
}

export type Seat = "premium" | "standard";

export interface SeatCount {
  premium: number;
  standard: number;
  byUser?: Record<string, Seat>;
}

export function parseMembers(text: string): SeatCount | undefined {
  const [header = [], ...rows] = parseCsv(text);
  const names = header.map((h) => h.toLowerCase());
  const email = names.findIndex((h) => h.includes("email"));
  const seat = names.findIndex((h) => h.includes("seat"));
  if (email < 0 || seat < 0) return undefined;
  const seats: SeatCount = { premium: 0, standard: 0, byUser: {} };
  for (const row of rows) {
    const address = row[email]?.trim().toLowerCase();
    if (!address?.includes("@")) continue;
    const type = row[seat]?.toLowerCase() ?? "";
    const kind: Seat | undefined = type.includes("premium") ? "premium" : type.includes("standard") ? "standard" : undefined;
    if (!kind) continue;
    seats[kind]++;
    seats.byUser![address] = kind;
  }
  return seats.premium + seats.standard > 0 ? seats : undefined;
}

export function spendReportPeriod(filename: string): { from: string; to: string } | undefined {
  const match = /(\d{4}-\d{2}-\d{2})-to-(\d{4}-\d{2}-\d{2})/.exec(filename);
  return match?.[1] && match[2] ? { from: match[1], to: match[2] } : undefined;
}
