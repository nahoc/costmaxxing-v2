import { byFamily, comparisonText, count, escapeHtml as esc, exactUsd, percent, usd, type Report, type Row } from "@openmaxxing/core";
import { icon } from "../../world/icons.ts";
import type { Step, TeamResult } from "./team.ts";

const SITE = "https://costmaxxing.dev";
const PEOPLE_SHOWN = 12;

export interface Csv {
  href: string;
  filename: string;
}

function figure(id: string, html: string): string {
  return `<a class="figure" href="#${id}" data-info="${id}">${html}</a>`;
}

function width(share: number): string {
  return `${(Math.max(0.015, Math.min(1, share)) * 100).toFixed(1)}%`;
}

function bar(share: number): string {
  return `<span class="meter"><span style="width:${width(share)}"></span></span>`;
}

function seatBar(overSeat: number, most: number): string {
  const over = Math.max(0, overSeat - 1) / most;
  return `<span class="usage"><span style="width:${width(Math.min(overSeat, 1) / most)}"></span>${over > 0 ? `<span class="over" style="width:${width(over)}"></span>` : ""}</span>`;
}

function times(n: number): string {
  return n < 0.1 ? "<0.1×" : `${n < 10 ? n.toFixed(1) : Math.round(n)}×`;
}

function savings(row: Row): string {
  return row.price >= row.alt ? usd(row.price - row.alt) : `${usd(row.alt - row.price)} more`;
}

function download(csv: Csv, isDefault: boolean): string {
  return `<a class="button${isDefault ? " default" : ""}" href="${csv.href}" download="${esc(csv.filename)}">Download CSV</a>`;
}

function retry(isDefault: boolean): string {
  return `<button class="button${isDefault ? " default" : ""}" type="button" data-action="retry">Try Again</button>`;
}

export function menubar(csv?: Csv): string {
  return `<header class="menubar">
<nav aria-label="Menu">
<div class="menu-group"><button class="menu-title logo" type="button" aria-expanded="false" aria-label="openmaxxing">${icon("logo")}</button>
<div class="menu" hidden><a href="${SITE}" target="_blank">About openmaxxing…</a></div></div>
<div class="menu-group"><button class="menu-title" type="button" aria-expanded="false">File</button>
<div class="menu" hidden>${csv ? `<a href="${csv.href}" download="${esc(csv.filename)}">Download CSV</a>` : ""}<button type="button" data-action="retry">Reload Report</button></div></div>
</nav>
<div class="menubar-right"><a href="https://github.com/nahoc/openmaxxing" target="_blank">GitHub</a></div>
</header>`;
}

function dialog(title: string, body: string, buttons: string): string {
  return `<section class="alert state" role="alertdialog" aria-labelledby="state-title">
${icon("caution")}
<div><h1 id="state-title">${title}</h1>${body}</div>
<div class="buttons">${buttons}</div>
</section>`;
}

export function loadingView(step: Step): string {
  return `<section class="alert state loading" aria-labelledby="state-title">
${icon("computer")}
<div><h1 id="state-title">Reading your team's bill</h1>
<p class="step" role="status">${esc(step.text)}</p>
<div class="progress" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(step.progress * 100)}"><span style="transform:scaleX(${step.progress})"></span></div>
<p>Everything stays in this browser.</p></div>
</section>`;
}

export function messageView(result: Exclude<TeamResult, { kind: "report" }>): string {
  switch (result.kind) {
    case "signed-out":
      return dialog(
        "Sign in to claude.ai first.",
        "<p>openmaxxing reads your team's spend report through your own claude.ai session in this browser.</p>",
        `${retry(false)}<a class="button default" href="https://claude.ai/login" target="_blank">Open claude.ai</a>`,
      );
    case "not-owner":
      return dialog(
        "Only Owners can see the team bill.",
        `<p>claude.ai lets only Owners export the spend report. Ask an Owner of your organization to install openmaxxing from <a href="${SITE}" target="_blank">costmaxxing.dev</a>.</p>`,
        retry(true),
      );
    case "failed":
      return dialog(
        "claude.ai didn't answer.",
        `<p>${esc(result.request)} failed (${esc(result.status)}). Nothing was sent anywhere else.</p>`,
        retry(true),
      );
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function lede(report: Report): string {
  const { hero, seats } = report;
  const headline =
    hero.year >= 0
      ? `Your team could save ${figure("info-year", usd(hero.year))} a&nbsp;year on open&#8209;weight models.`
      : `Open&#8209;weight models would cost your team ${figure("info-year", usd(-hero.year))} more a&nbsp;year.`;
  const multiple = seats && seats.monthly > 0 && seats.worth > seats.monthly ? `, ${times(seats.worth / seats.monthly)} what you pay` : "";
  const subsidy =
    seats?.kind === "seats"
      ? `<p class="subsidy">Your ${count(seats.premium + seats.standard)} seats cost ${figure("info-seats", `${usd(seats.monthly)} a month`)}. At Anthropic's API prices, the same usage is worth ${figure("info-worth", `${usd(seats.worth)} a month`)}${multiple}.</p>`
      : "";
  return `<h1>${headline}</h1>
${subsidy}
<div class="figures">
${figure("info-price", `<span class="mid">${usd(hero.price)}</span><span>at Anthropic's API prices</span>`)}
${figure("info-alt", `<span class="mid">${usd(hero.alt)}</span><span>on open&#8209;weight models</span>`)}
${figure("info-year", `<span class="mid">Up to ${percent(hero.percent)}</span><span>you could save</span>`)}
</div>`;
}

function people(report: Report): string {
  const rows = report.byUser ?? [];
  if (rows.length === 0) return "";
  const over = rows.filter((row) => (row.overSeat ?? 0) > 1).length;
  const most = Math.max(1, ...rows.map((row) => row.overSeat ?? 0));
  const top = rows[0];
  const body = rows
    .map((row, i) => {
      const seat = row.seat === "premium" ? "Premium" : row.seat === "standard" ? "Standard" : "";
      return `<tr${i >= PEOPLE_SHOWN ? " hidden" : ""}><td class="name">${esc(row.label)}</td><td>${seat}</td><td class="num">${usd(row.price)}</td><td class="num">${row.overSeat === undefined ? "" : times(row.overSeat)}</td><td class="bar">${row.overSeat === undefined ? "" : seatBar(row.overSeat, most)}</td><td class="num">${savings(row)}</td></tr>`;
    })
    .join("");
  return `<section class="section" aria-labelledby="people-title">
<h2 id="people-title">People</h2>
<p>${count(over)} of ${count(rows.length)} people use more than their seat costs.${top?.overSeat && top.overSeat > 1 ? ` ${esc(top.label)} uses ${times(top.overSeat)} theirs.` : ""} <span class="legend"><span class="zebra-chip"></span> marks usage past the seat price.</span></p>
<table class="sheet"><thead><tr><th scope="col">Person</th><th scope="col">Seat</th><th scope="col" class="num">API price</th><th scope="col" class="num">Vs seat</th><th scope="col" class="bar"><span class="sr">Usage against the seat price</span></th><th scope="col" class="num">Open&#8209;weight savings</th></tr></thead>
<tbody>${body}</tbody></table>
${rows.length > PEOPLE_SHOWN ? `<button class="button more" type="button" data-action="more">Show All ${count(rows.length)}</button>` : ""}
</section>`;
}

function productsAndModels(report: Report): string {
  const products = report.byProduct ?? [];
  const total = report.hero.price;
  const product = products[0];
  const models = byFamily(report.models);
  const model = models[0];
  const insight = [
    product && total > 0 ? `${esc(product.label)} is ${percent(product.price / total)} of the bill.` : "",
    model?.replacement ? `${esc(model.label)} costs the most, ${usd(model.price)}. ${esc(model.replacement)} does the same work for ${usd(model.alt)}.` : "",
  ].join(" ");
  const productRows = products
    .map((row) => `<tr><td class="name">${esc(row.label)}</td><td class="num">${usd(row.price)}</td><td class="bar">${bar(total > 0 ? row.price / total : 0)}</td><td class="num">${usd(row.alt)}</td><td class="num">${savings(row)}</td></tr>`)
    .join("");
  const modelRows = models
    .map((row) => `<tr><td class="name">${esc(row.label)}</td><td class="num">${count(row.requests)}</td><td class="num">${usd(row.price)}</td><td>${esc(row.replacement ?? "")}</td><td class="num">${usd(row.alt)}</td><td class="num">${savings(row)}</td></tr>`)
    .join("");
  return `<section class="section" aria-labelledby="models-title">
<h2 id="models-title">Products and models</h2>
<p>${insight}</p>
${products.length > 0 ? `<table class="sheet"><thead><tr><th scope="col">Product</th><th scope="col" class="num">API price</th><th scope="col" class="bar"><span class="sr">Share of the bill</span></th><th scope="col" class="num">Open&#8209;weight cost</th><th scope="col" class="num">Open&#8209;weight savings</th></tr></thead><tbody>${productRows}</tbody></table>` : ""}
<table class="sheet"><thead><tr><th scope="col">Model</th><th scope="col" class="num">Requests</th><th scope="col" class="num">API price</th><th scope="col">Replaced by</th><th scope="col" class="num">Open&#8209;weight cost</th><th scope="col" class="num">Open&#8209;weight savings</th></tr></thead><tbody>${modelRows}</tbody></table>
</section>`;
}

function providers(report: Report): string {
  const priced = report.providers.flatMap((c) => (c.kind === "priced" ? [c] : []));
  const best = priced[0];
  const rows = report.providers
    .map((c) => {
      const name = `<td class="name">${c.url ? `<a href="${esc(c.url)}" target="_blank">${esc(c.name)}</a>` : esc(c.name)}</td>`;
      return c.kind === "priced"
        ? `<tr>${name}<td class="num">${usd(c.savings)}</td><td class="num">${percent(c.percent)}</td></tr>`
        : `<tr>${name}<td colspan="2">${esc(comparisonText(c))}</td></tr>`;
    })
    .join("");
  return `<section class="section" aria-labelledby="providers-title">
<h2 id="providers-title">Providers</h2>
<p>${best ? `The same plan at each provider. ${esc(best.name)} saves the most, ${usd(best.savings)} over ${report.days} days.` : "No provider lists these models."}</p>
<table class="sheet"><thead><tr><th scope="col">Provider</th><th scope="col" class="num">Open&#8209;weight savings</th><th scope="col" class="num">Saved</th></tr></thead><tbody>${rows}</tbody></table>
</section>`;
}

function forecastAndMethod(report: Report): string {
  const pace = report.forecast.at(-1);
  const periods = pace
    ? ([
        ["Per day", pace.perDay],
        ["Per month", pace.month],
        ["Per year", pace.year],
      ] as const)
    : [];
  const notes = [
    `The open&#8209;weight plan: ${esc(report.hero.detail ?? report.hero.name)}.`,
    "Both sides price the same tokens: uncached input, output, cache reads, and cache writes.",
    'Prices come from <a href="https://models.dev" target="_blank">models.dev</a> and each provider\'s public rates.',
    report.seats?.kind === "seats" && report.seats.estimated ? "Seats are estimated: anyone who used Fable counts as Premium, everyone else as Standard." : "",
    report.unpriced.length > 0
      ? `No price for ${esc(report.unpriced.map((u) => `${u.model} (${count(u.requests)} requests)`).join(", "))}, so it's left out of both sides.`
      : "",
  ].filter(Boolean);
  return `<section class="section" aria-labelledby="forecast-title">
<h2 id="forecast-title">Forecast and method</h2>
<p>At the pace of the last ${report.days} days.</p>
<table class="sheet"><thead><tr><th scope="col"><span class="sr">Period</span></th><th scope="col" class="num">API price</th><th scope="col" class="num">Open&#8209;weight cost</th><th scope="col" class="num">Open&#8209;weight savings</th></tr></thead><tbody>
${periods.map(([label, cost]) => `<tr><td class="name">${label}</td><td class="num">${usd(cost.price)}</td><td class="num">${usd(cost.alt)}</td><td class="num">${usd(cost.price - cost.alt)}</td></tr>`).join("")}
</tbody></table>
<ul class="notes">${notes.map((note) => `<li>${note}</li>`).join("")}</ul>
</section>`;
}

function infos(report: Report): string {
  const { hero, seats } = report;
  const info = (id: string, title: string, rows: [string, string][]) =>
    `<section class="window info active" id="${id}" role="dialog" aria-label="${esc(title)}" hidden>
<div class="titlebar"><button class="close" type="button" aria-label="Close"></button><span class="title">${esc(title)}</span></div>
<dl class="body">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
</section>`;
  return [
    info("info-price", "Anthropic price", [
      ["Amount", `${exactUsd(hero.price)} over ${report.days} days.`],
      ["Usage", `${count(report.users ?? 0)} people, ${count(report.requests)} requests, ${count(report.tokens)} tokens.`],
      ["Math", "Each token type times its API rate per million tokens."],
    ]),
    info("info-alt", "Open-weight cost", [
      ["Amount", `${exactUsd(hero.alt)} for the same tokens.`],
      ["Plan", esc(hero.detail ?? hero.name)],
    ]),
    info("info-year", "Open-weight savings", [
      ["Period", `${exactUsd(hero.price - hero.alt)} over ${report.days} days, ${percent(hero.percent)} of the API price.`],
      ["Month", `${exactUsd(hero.month)}, at the same pace.`],
      ["Year", `${exactUsd(hero.year)}, at the same pace.`],
    ]),
    ...(seats?.kind === "seats"
      ? [
          info("info-seats", "Seats", [
            ["Seats", `${count(seats.premium)} Premium, ${count(seats.standard)} Standard${seats.estimated ? " (estimated)" : ""}.`],
            ["Price", `${exactUsd(seats.monthly)} a month at $125 per Premium and $25 per Standard seat.`],
          ]),
          info("info-worth", "Usage worth", [
            ["Amount", `${exactUsd(seats.worth)} a month.`],
            ["Math", "Usage at API prices, averaged per day, times 30."],
          ]),
        ]
      : []),
  ].join("");
}

export function memoView(report: Report, csv: Csv, full: boolean): string {
  const title = `${esc(report.org ?? "Team bill")}${full ? ` · last ${report.days} days` : ""}`;
  if (!full) {
    return `<section class="window memo compact active" aria-labelledby="memo-title">
<div class="titlebar"><span class="title" id="memo-title">${title}</span></div>
<div class="body">${lede(report)}</div>
<div class="actions">${download(csv, false)}<a class="button default" href="report.html" target="_blank">Open Full Report</a></div>
</section>${infos(report)}`;
  }
  return `<article class="window memo active" aria-labelledby="memo-title">
<div class="titlebar"><span class="title" id="memo-title">${title}</span></div>
<div class="ruler" aria-hidden="true"></div>
<div class="body">
${lede(report)}
${people(report)}
${productsAndModels(report)}
${providers(report)}
${forecastAndMethod(report)}
<section class="closing" aria-labelledby="closing-title"><h2 id="closing-title">What will you do when the subsidies end?</h2>
<div class="actions">${download(csv, true)}</div></section>
</div>
</article>${infos(report)}`;
}
