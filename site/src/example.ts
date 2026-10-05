import {
  buildReport,
  parseModelsDev,
  parseSpendReport,
  priceBook,
  type Report,
  type SpendRow,
} from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };

const PEOPLE = [
  "ada",
  "grace",
  "linus",
  "margaret",
  "ken",
  "barbara",
  "dennis",
  "frances",
  "edsger",
  "radia",
  "alan",
  "hedy",
  "tim",
  "katherine",
  "john",
];
const MODELS = ["claude-opus-5-5", "claude-fable-5-1", "claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-5"];
const PRODUCTS = ["Claude Code", "Chat", "Cowork", "Research"];
const HEADER =
  "user_email,account_uuid,product,model,total_requests,total_prompt_tokens,total_completion_tokens,total_net_spend_usd,total_gross_spend_usd,user_id,total_uncached_input_tokens,total_cache_read_tokens,total_cache_write_5m_tokens,total_cache_write_1h_tokens,total_web_search_count,slack_channel_id,teams_channel_id";

function exampleCsv(): string {
  const lines = [HEADER];
  PEOPLE.forEach((name, u) => {
    PRODUCTS.forEach((product, p) => {
      if ((u + p) % 3 === 0) return;
      const model = MODELS[((u + 1) * 7 + p) % (u % 4 === 3 ? 5 : 4)];
      const requests = Math.round((product === "Claude Code" ? 40 : 3) * (20 + (((u + 1) * 37 + p * 11) % 90)));
      const read = requests * 60_000;
      const uncached = requests * 900;
      const write5m = requests * 3000;
      const write1h = requests * 1500;
      const output = requests * 1800;
      lines.push(
        [`${name}@acme.example`, `a${u}`, product, model, requests, read + uncached + write5m + write1h, output, 0, 0, `u${u}`, uncached, read, write5m, write1h, 0, "", ""].join(","),
      );
    });
  });
  return lines.join("\n");
}

export interface Person {
  name: string;
  seat: "Premium" | "Standard";
  price: number;
  subsidized: boolean;
}

export interface Example {
  report: Report;
  people: Person[];
  subsidized: number;
  rows: SpendRow[];
}

export const SEAT = { Premium: 125, Standard: 25 };

export const book = priceBook(parseModelsDev(snapshot));

export function example(): Example {
  const rows = parseSpendReport(exampleCsv());
  const report = buildReport({
    dataset: { kind: "spend", rows, from: "2026-09-04", to: "2026-10-03", org: "Acme Robotics", recent: true },
    book,
  });
  const premium = new Set(rows.filter((row) => /fable/i.test(row.model)).map((row) => row.user));
  const people = (report.byUser ?? []).map((row): Person => {
    const seat = premium.has(row.label) ? "Premium" : "Standard";
    return { name: row.label.split("@")[0] ?? row.label, seat, price: row.price, subsidized: row.price > SEAT[seat] };
  });
  return { report, people, subsidized: people.filter((p) => p.subsidized).length, rows };
}
