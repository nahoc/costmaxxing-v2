import type { Report, SeatLine } from "./report.ts";

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

export function count(n: number): string {
  return compact.format(n).replace("K", "k");
}

export function usd(n: number): string {
  if (n < 0) return `-${usd(-n)}`;
  if (n < 0.5) return "<$1";
  return `$${count(n < 1000 ? Math.round(n) : n)}`;
}

const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function exactUsd(n: number): string {
  return cents.format(n);
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function savingsText(price: number, alt: number): string {
  return price >= alt ? `${usd(price - alt)} savings` : `${usd(alt - price)} more`;
}

export function plural(n: number, word: string): string {
  return `${count(n)} ${word}${n === 1 ? "" : "s"}`;
}

export function titleText(report: Report): string {
  return [
    "costmaxxing",
    report.org,
    report.scope,
    report.sessions === undefined ? undefined : plural(report.sessions, "session"),
    report.users === undefined ? undefined : plural(report.users, "user"),
    plural(report.requests, "request"),
    plural(report.tokens, "token"),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function seatText(line: SeatLine): string {
  const who =
    line.kind === "plan"
      ? line.name
      : `${line.premium} Premium + ${line.standard} Standard seats${line.estimated ? " (estimated)" : ""}`;
  const ratio = line.monthly > 0 ? line.worth / line.monthly : 0;
  const subsidy = ratio >= 10 ? Math.round(ratio).toString() : ratio.toFixed(1);
  return `${who}: ${usd(line.monthly)}/month for usage worth ${usd(line.worth)} at API prices (${subsidy}× subsidy)`;
}

export function heroText(report: Report) {
  const { hero } = report;
  const period = report.recent ? `The last ${report.days} days` : `These ${report.days} days`;
  const costsMore = hero.year < 0;
  return {
    headline: costsMore ? `Switching to ${hero.name} would cost more:` : `Switch to ${hero.name} and potentially save:`,
    detail: hero.detail,
    figures: costsMore
      ? [`${usd(-hero.year)} / year more`, `${usd(-hero.month)} / month more`, `${percent(-hero.percent)} more`]
      : [`${usd(hero.year)} / year`, `${usd(hero.month)} / month`, `${percent(hero.percent)} savings`],
    window: `${period} would've cost: ${usd(hero.alt)} on ${hero.name} instead of ${usd(hero.price)}`,
    seats: report.seats && seatText(report.seats),
    closer: "What will you do when the subsidies end?",
  };
}

export function unpricedText(report: Report): string | undefined {
  if (report.unpriced.length === 0) return undefined;
  return `No price for ${report.unpriced.map((u) => `${u.model} (${plural(u.requests, "request")})`).join(", ")}`;
}

export function altHeader(report: Report): string {
  return `If using ${report.hero.name}`;
}

export function comparisonText(c: Report["providers"][number]): string {
  if (c.kind === "missing") return `doesn't list ${c.models.join(", ")}`;
  return c.savings >= 0 ? `${usd(c.savings)} savings · ${percent(c.percent)}` : `${usd(-c.savings)} more`;
}
