import { altHeader, comparisonText, count, exactUsd, heroText, savingsText, titleText, unpricedText, usd } from "./format.ts";
import type { Comparison, Report, Row } from "./report.ts";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const money = (n: number) => `<span title="${exactUsd(n)}">${usd(n)}</span>`;

export const REPORT_CSS = `
:root { color-scheme: light dark; }
.cmx { font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif; color: #1c1c1c; max-width: 1080px; margin: 0 auto; padding: 16px; }
.cmx h1 { font-size: 13px; font-weight: 600; margin: 0 0 12px; }
.cmx h2 { font-size: 13px; font-weight: 600; margin: 20px 0 6px; }
.cmx .hero { border: 1px solid #d9d9d9; border-radius: 10px; padding: 14px 16px; }
.cmx .hero p { margin: 2px 0; }
.cmx .headline { font-weight: 600; }
.cmx .muted { color: #6b6b6b; }
.cmx .figures { display: flex; gap: 28px; margin: 10px 0 !important; font-size: 20px; font-weight: 650; color: #2f8a4a; font-variant-numeric: tabular-nums; }
.cmx table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.cmx th { text-align: left; font-weight: 500; color: #6b6b6b; padding: 4px 22px 4px 0; white-space: nowrap; }
.cmx td { padding: 3px 22px 3px 0; white-space: nowrap; }
.cmx .num { text-align: right; }
.cmx .save { color: #2f8a4a; }
.cmx .bar { display: inline-block; width: 90px; height: 7px; border-radius: 4px; background: #ececec; overflow: hidden; vertical-align: middle; }
.cmx .bar span { display: block; height: 100%; background: #6cc287; }
@media (prefers-color-scheme: dark) {
  .cmx { color: #e8e8e8; }
  .cmx .hero { border-color: #3a3a3a; }
  .cmx .muted, .cmx th { color: #9a9a9a; }
  .cmx .figures, .cmx .save { color: #7ed69a; }
  .cmx .bar { background: #333; }
}
`;

export interface HtmlOptions {
  full: boolean;
}

function table(report: Report, title: string, rows: Row[] | undefined): string {
  if (!rows || rows.length === 0) return "";
  const total = rows.reduce((n, row) => n + row.price, 0);
  const body = rows
    .map(
      (row) => `<tr><td>${escapeHtml(row.label)}</td><td class="num">${count(row.requests)}</td><td class="num">${count(row.tokens)}</td><td class="num">${money(row.price)}</td><td><span class="bar"><span style="width:${total > 0 ? ((row.price / total) * 100).toFixed(1) : 0}%"></span></span></td><td>${money(row.alt)} <span class="${row.price >= row.alt ? "save" : "muted"}">${savingsText(row.price, row.alt)}</span></td></tr>`,
    )
    .join("");
  return `<h2>${escapeHtml(title)}</h2><table><tr><th></th><th class="num">Requests</th><th class="num">Tokens</th><th class="num">Price</th><th>Share</th><th>${escapeHtml(altHeader(report))}</th></tr>${body}</table>`;
}

function comparisons(title: string, list: Comparison[]): string {
  if (list.length === 0) return "";
  const body = list
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td class="${c.kind === "priced" && c.savings >= 0 ? "save" : "muted"}">${escapeHtml(comparisonText(c))}</td></tr>`,
    )
    .join("");
  return `<h2>${escapeHtml(title)}</h2><table>${body}</table>`;
}

export function renderHtml(report: Report, options: HtmlOptions): string {
  const hero = heroText(report);
  const parts = [
    `<h1>${escapeHtml(titleText(report))}</h1>`,
    `<section class="hero">`,
    `<p class="headline">${escapeHtml(hero.headline)}</p>`,
    hero.detail ? `<p class="muted">${escapeHtml(hero.detail)}</p>` : "",
    `<p class="figures">${hero.figures.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}</p>`,
    `<p title="${exactUsd(report.hero.alt)} instead of ${exactUsd(report.hero.price)}">${escapeHtml(hero.window)}</p>`,
    hero.seats ? `<p>${escapeHtml(hero.seats)}</p>` : "",
    `<p class="headline">${escapeHtml(hero.closer)}</p>`,
    `</section>`,
  ];
  if (options.full) parts.push(table(report, "By harness", report.byHarness));
  parts.push(table(report, "By user", report.byUser), table(report, "By product", report.byProduct));
  if (options.full) {
    const forecast = report.forecast
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.label)}</td><td class="num">${usd(row.perDay.price)}</td><td class="num">${usd(row.month.price)}</td><td class="num">${usd(row.year.price)}</td><td>${usd(row.year.alt)} / year <span class="save">${savingsText(row.year.price, row.year.alt)}</span></td></tr>`,
      )
      .join("");
    parts.push(
      `<h2>Forecast</h2><table><tr><th></th><th class="num">Per day</th><th class="num">Month</th><th class="num">Year</th><th>${escapeHtml(altHeader(report))}</th></tr>${forecast}</table>`,
      table(report, "Top models", report.models),
    );
    const unpriced = unpricedText(report);
    if (unpriced) parts.push(`<p class="muted">${escapeHtml(unpriced)}</p>`);
  }
  parts.push(comparisons("Providers", report.providers));
  if (options.full) parts.push(comparisons("Scenarios", report.scenarios));
  return `<div class="cmx">${parts.join("")}</div>`;
}

export function renderPage(report: Report): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>costmaxxing</title><style>${REPORT_CSS} body { margin: 0; }</style></head><body>${renderHtml(report, { full: true })}</body></html>`;
}
