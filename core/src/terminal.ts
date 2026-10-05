import { altHeader, comparisonText, count, heroText, savingsText, titleText, unpricedText, usd } from "./format.ts";
import type { Comparison, Report, Row } from "./report.ts";

type Style = (text: string) => string;
type Segment = { text: string; style?: Style };
type Cell = { segments: Segment[]; right?: boolean };

export interface TerminalOptions {
  color: boolean;
  width: number;
  command: string;
}

const TOP_MODELS = 8;
const BAR = 12;

function styles(color: boolean) {
  const wrap = (open: string, close: string): Style => (text) => (color ? `\x1b[${open}m${text}\x1b[${close}m` : text);
  return { bold: wrap("1", "22"), dim: wrap("2", "22"), green: wrap("38;5;114", "39") };
}

const plain = (text: string, style?: Style): Cell => ({ segments: [{ text, style }] });
const number = (text: string): Cell => ({ segments: [{ text }], right: true });
const width = (cell: Cell) => cell.segments.reduce((n, s) => n + s.text.length, 0);

function grid(rows: Cell[][]): string[] {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, width(cell))));
  return rows.map((row) =>
    row
      .map((cell, i) => {
        const pad = " ".repeat((widths[i] ?? 0) - width(cell));
        const text = cell.segments.map((s) => (s.style ? s.style(s.text) : s.text)).join("");
        return cell.right ? pad + text : i === row.length - 1 ? text : text + pad;
      })
      .join("   ")
      .trimEnd(),
  );
}

function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line];
}

export function renderTerminal(report: Report, options: TerminalOptions): string {
  const s = styles(options.color);
  const hero = heroText(report);
  const out: string[] = [s.bold(titleText(report)), ""];

  const boxLines: Segment[] = [
    { text: hero.headline, style: s.bold },
    ...(hero.detail ? [{ text: hero.detail, style: s.dim }] : []),
    { text: "" },
    { text: hero.figures.join("     "), style: (t: string) => s.bold(s.green(t)) },
    { text: "" },
    { text: hero.window },
    ...(hero.seats ? [{ text: hero.seats }] : []),
    { text: hero.closer, style: s.bold },
  ];
  const inner = Math.min(Math.max(...boxLines.map((line) => line.text.length)), Math.max(40, options.width - 6));
  const wrapped = boxLines.flatMap((line) => wrapText(line.text, inner).map((text) => ({ text, style: line.style })));
  out.push(s.dim(`╭${"─".repeat(inner + 4)}╮`), s.dim(`│${" ".repeat(inner + 4)}│`));
  for (const line of wrapped) {
    const text = line.style && line.text ? line.style(line.text) : line.text;
    out.push(`${s.dim("│")}  ${text}${" ".repeat(inner - line.text.length)}  ${s.dim("│")}`);
  }
  out.push(s.dim(`│${" ".repeat(inner + 4)}│`), s.dim(`╰${"─".repeat(inner + 4)}╯`));

  const table = (title: string, rows: Row[], limit = rows.length) => {
    if (rows.length === 0) return;
    const total = rows.reduce((n, row) => n + row.price, 0);
    const altWidth = Math.max(...rows.map((row) => usd(row.alt).length));
    const header = [title, "Requests", "Tokens", "Price", "Share", altHeader(report)];
    const body = rows.slice(0, limit).map((row): Cell[] => {
      const filled = total > 0 ? Math.round((row.price / total) * BAR) : 0;
      return [
        plain(row.label),
        number(count(row.requests)),
        number(count(row.tokens)),
        number(usd(row.price)),
        {
          segments: [
            { text: "█".repeat(filled), style: s.green },
            { text: "⠂".repeat(BAR - filled), style: s.dim },
          ],
        },
        {
          segments: [
            { text: usd(row.alt).padEnd(altWidth + 2) },
            { text: savingsText(row.price, row.alt), style: row.price >= row.alt ? s.green : s.dim },
          ],
        },
      ];
    });
    out.push(
      "",
      ...grid([
        header.map((h, i) => ({ segments: [{ text: h, style: i === 0 ? s.bold : s.dim }], right: i > 0 && i < 4 })),
        ...body,
      ]),
    );
    if (rows.length > limit) out.push(s.dim(`+ ${rows.length - limit} more (--json for all)`));
  };

  const comparisons = (title: string, list: Comparison[]) => {
    if (list.length === 0) return;
    out.push(
      "",
      s.bold(title),
      ...grid(
        list.map((c) => [plain(c.name), plain(comparisonText(c), c.kind === "priced" && c.savings >= 0 ? s.green : s.dim)]),
      ),
    );
  };

  if (report.byHarness) table("By harness", report.byHarness);
  if (report.byUser) table("By user", report.byUser);
  if (report.byProduct) table("By product", report.byProduct);

  out.push(
    "",
    ...grid([
      ["Forecast", "Per day", "Month", "Year", altHeader(report)].map((h, i) => ({
        segments: [{ text: h, style: i === 0 ? s.bold : s.dim }],
        right: i > 0 && i < 4,
      })),
      ...report.forecast.map((row): Cell[] => [
        plain(row.label),
        number(usd(row.perDay.price)),
        number(usd(row.month.price)),
        number(usd(row.year.price)),
        {
          segments: [
            { text: `${usd(row.year.alt)} / year  ` },
            { text: savingsText(row.year.price, row.year.alt), style: s.green },
          ],
        },
      ]),
    ]),
  );

  table("Top models", report.models, TOP_MODELS);
  const unpriced = unpricedText(report);
  if (unpriced) out.push(s.dim(unpriced));

  comparisons("Providers", report.providers);
  comparisons("Scenarios", report.scenarios);

  const cmd = options.command;
  const tries: [string, string][] =
    report.kind === "logs"
      ? [
          [`${cmd} --vs togetherai/zai-org/GLM-5.3`, "price everything on one model"],
          [`${cmd} claude`, "count a Claude Code session live"],
          [`${cmd} web`, "open this report in your browser"],
          [`${cmd} --json`, "every number, every model"],
          ["openmaxxing browser extension", "team report for claude.ai Owners"],
        ]
      : [
          [`${cmd} import <csv> --seats premium=N,standard=N`, "exact seats instead of the estimate"],
          [`${cmd} import <csv> --billing annual`, "annual seat prices"],
          [`${cmd} import <csv> --json`, "every number, every model"],
          [cmd, "your own Claude Code and Codex usage"],
        ];
  out.push("", s.bold("Try next"), ...grid(tries.map(([c, why]) => [plain(`  ${c}`), plain(why, s.dim)])));
  return `${out.join("\n")}\n`;
}
