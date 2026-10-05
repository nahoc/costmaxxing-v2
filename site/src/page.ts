import { comparisonText, count, escapeHtml as esc, exactUsd, percent, seatText, usd } from "@costmaxxing/core";
import type { Example } from "./example.ts";
import { PRICE_LADDER, SWE_BENCH } from "./claims.ts";
import { SEAT } from "./example.ts";
import { icon, SPRITE, type IconName } from "./icons.ts";

export interface Install {
  href: string;
  label: string;
  zip: boolean;
}

interface WindowSpec {
  id: string;
  title: string;
  className: string;
  body: string;
  status?: string[];
  label?: string;
  closed?: boolean;
}

function win({ id, title, className, body, status, label, closed }: WindowSpec): string {
  return `<section class="window ${className}" id="${id}" aria-label="${esc(label ?? title)}"${closed ? " hidden" : ""}>
<div class="titlebar"><button class="close" type="button" aria-label="Close ${esc(title)}"></button><span class="title">${esc(title)}</span></div>
<div class="body">${body}</div>
${status ? `<div class="status">${status.map((s) => `<span>${s}</span>`).join("")}</div>` : ""}
</section>`;
}

function info(id: string, title: string, rows: [string, string][]): string {
  return `<section class="window info" id="${id}" role="dialog" aria-label="${esc(title)}" hidden>
<div class="titlebar"><button class="close" type="button" aria-label="Close ${esc(title)}"></button><span class="title">${esc(title)}</span></div>
<dl class="body">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
</section>`;
}

function figure(target: string, html: string): string {
  return `<a class="figure" href="#${target}" data-info="${target}">${html}</a>`;
}

function rate(perMillion: number): string {
  return Number.isInteger(perMillion) ? `$${perMillion}` : `$${perMillion.toFixed(2)}`;
}

function meter(share: number, anthropic: boolean): string {
  return `<span class="meter"><span class="${anthropic ? "anthropic" : ""}" style="width:${Math.max(1.5, share * 100).toFixed(1)}%"></span></span>`;
}

export function renderPage({ example, install, css, js, zipSize }: { example: Example; install: Install; css: string; js: string; zipSize: string }): string {
  const { report, people, subsidized } = example;
  const { hero } = report;
  const top = people.slice(0, 5);
  const most = Math.max(...top.map((p) => p.price));
  const zipAttrs = install.zip ? ' download data-zip=""' : "";
  const [best, glm, fable, flash] = SWE_BENCH.rows;
  if (!best || !glm || !fable || !flash) throw new Error("SWE_BENCH needs four rows");
  const benchLine = `Not a downgrade: ${glm.name} scores ${glm.score.toFixed(1)}% on SWE-bench Verified, ahead of ${fable.name} at ${fable.score.toFixed(1)}%.`;
  const [fable51, opus55] = PRICE_LADDER;
  if (!fable51 || !opus55) throw new Error("PRICE_LADDER needs Fable and Opus");
  const topOutput = Math.max(...PRICE_LADDER.map((m) => m.output));
  const cta = `<a class="button default" href="${esc(install.href)}"${zipAttrs}>${esc(install.label)}</a>`;

  const dialog = `<section class="alert hero" id="hero" aria-labelledby="hero-title">
<div class="alert-icon">${icon("computer")}</div>
<div class="alert-text"><h1 id="hero-title">How much can your team save by moving from Anthropic to open&#8209;weight models?</h1>
<p>Add costmaxxing to Chrome as a claude.ai Owner, and your team's real bill opens on its own: every person, product, and model at Anthropic's API prices, next to the same usage on open&#8209;weight models.</p>
<p>It runs in your browser. Nothing is uploaded.</p>
<p class="claim">${figure("info-bench", esc(benchLine))}</p></div>
<div class="buttons">${cta}</div>
</section>`;

  const bill = win({
    id: "bill",
    title: "Team Bill (example)",
    className: "bill",
    label: "Team Bill, an example team with synthetic data",
    body: `<p class="meta">${esc(report.org ?? "")} · last ${report.days} days · ${count(report.users ?? 0)} people</p>
<p class="savings">${figure("info-savings", `<span class="big">${usd(hero.year)}</span> a year in savings`)}</p>
<div class="figures">
${figure("info-price", `<span class="mid">${usd(hero.price)}</span> on Anthropic`)}
${figure("info-alt", `<span class="mid">${usd(hero.alt)}</span> on open&#8209;weight models`)}
${figure("info-savings", `<span class="mid">${percent(hero.percent)}</span> savings`)}
</div>
<p class="seatline">${figure("info-seats", esc(report.seats ? seatText(report.seats) : ""))}</p>
<table class="people">
<caption>Top ${top.length} of ${people.length} people. <span class="zebra-chip" aria-hidden="true"></span> ${subsidized} use more than their seat costs.</caption>
<thead><tr><th scope="col">Person</th><th scope="col">Seat</th><th scope="col" class="num">Price</th><th scope="col"><span class="sr">Share of the bill</span></th></tr></thead>
<tbody>${top
      .map(
        (p) =>
          `<tr><td>${esc(p.name)}</td><td>${p.seat}</td><td class="num">${usd(p.price)}</td><td><span class="share"><span class="fill${p.subsidized ? " over" : ""}" style="width:${Math.max(4, Math.round((p.price / most) * 100))}%"></span></span>${p.subsidized ? '<span class="sr"> (uses more than the seat costs)</span>' : ""}</td></tr>`,
      )
      .join("")}</tbody>
</table>`,
    status: ["synthetic example", "priced by models.dev"],
  });

  const paint = win({
    id: "paint",
    title: "Wall Street, 1915",
    className: "paint",
    closed: true,
    body: `<img src="wall-street-1915.png" width="560" height="441" alt="Paul Strand's 1915 photograph of Wall Street: tiny figures walk past the enormous dark windows of a bank, dithered to two colors." />`,
    status: ["Paul Strand", "public domain"],
  });

  const desktopIcons: [string, IconName, string][] = [
    ["bill", "bill", "Team Bill"],
    ["paint", "paint", "Wall Street"],
    ["install", "floppy", "Install"],
  ];
  const icons = desktopIcons
    .map(([id, name, label]) => `<li><button class="icon" type="button" data-open="${id}">${icon(name)}<span>${label}</span></button></li>`)
    .join("");

  const subsidy = win({
    id: "subsidy",
    title: "The Subsidy",
    className: "subsidy",
    body: `<p class="lead">Anthropic's API prices are wild.</p>
<table class="ladder"><caption class="sr">Output price per million tokens</caption><tbody>${PRICE_LADDER.map(
      (m) => `<tr><td>${esc(m.name)}</td><td>${meter(m.output / topOutput, m.anthropic)}</td><td class="num">${rate(m.output)}</td></tr>`,
    ).join("")}</tbody></table>
<p>${esc(fable51.name)} costs ${rate(fable51.input)} per million input tokens and ${rate(fable51.output)} per million output tokens. ${esc(opus55.name)} costs ${rate(opus55.input)} and ${rate(opus55.output)}. ${esc(glm.name)} costs ${rate(glm.input)} and ${rate(glm.output)}.</p>
<p>claude.ai seats hide those prices. A Premium seat costs $${SEAT.Premium} a month, and the usage inside it never shows up on the bill. For a busy engineer, that usage can be worth several times the seat at API prices. That gap is the subsidy, and it's why the seats feel like a great deal right now.</p>
<p>Subsidies like this rarely last. When seat prices move toward API prices, you'll want to know your team's real bill, and what the same work costs on open&#8209;weight models.</p>`,
    status: ["output price per million tokens", "public rates"],
  });

  const bench = win({
    id: "bench",
    title: "Benchmarks",
    className: "bench",
    body: `<p class="lead">Not a downgrade.</p>
<p>SWE-bench Verified asks a model to fix 500 real GitHub issues. ${esc(glm.name)} lands ${(best.score - glm.score).toFixed(1)} points behind ${esc(best.name)} and ahead of ${esc(fable.name)}, at a fraction of the price.</p>
<table class="scores"><thead><tr><th scope="col">Model</th><th scope="col" class="num">Score</th><th scope="col"><span class="sr">Score bar</span></th><th scope="col" class="num">Output</th></tr></thead><tbody>${SWE_BENCH.rows
      .map(
        (m) =>
          `<tr><td>${esc(m.name)}</td><td class="num">${m.score.toFixed(1)}%</td><td>${meter(m.score / 100, m.anthropic)}</td><td class="num">${rate(m.output)}</td></tr>`,
      )
      .join("")}</tbody></table>
<p><a href="${SWE_BENCH.url}">${SWE_BENCH.source}</a>, ${SWE_BENCH.harness} harness, updated ${SWE_BENCH.updated}. Output is the price per million output tokens. Claude still leads on the hardest long-horizon agent benchmarks.</p>`,
    status: ["SWE-bench Verified", `source: ${SWE_BENCH.source}`],
  });

  const how = win({
    id: "how",
    title: "How It Works",
    className: "how",
    body: `<table class="list">
<thead><tr><th scope="col">Name</th><th scope="col">When</th><th scope="col">What happens</th></tr></thead>
<tbody>
<tr><td>${icon("floppy")}Add to Chrome</td><td>Now</td><td>Install it while you're signed in to claude.ai as an Owner.</td></tr>
<tr><td>${icon("bill")}Your bill opens</td><td>Next</td><td>A new tab reads your org's spend report with your own claude.ai session and prices every row with models.dev.</td></tr>
<tr><td>${icon("readMe")}The savings</td><td>Same tab</td><td>Every person, product, and model at Anthropic's API prices, next to the same usage on open&#8209;weight models.</td></tr>
<tr><td>${icon("paint")}Download CSV</td><td>Any time</td><td>Save the spend report as a file to keep or share.</td></tr>
</tbody></table>`,
    status: ["4 items", "Owners only", "Chrome"],
  });

  const providers = report.providers
    .map(
      (c) =>
        `<li class="${c.kind === "priced" ? "" : "missing"}"><span class="pname">${esc(c.name)}</span><span class="pvalue">${esc(comparisonText(c))}</span></li>`,
    )
    .join("");
  const chooser = win({
    id: "chooser",
    title: "Providers",
    className: "chooser",
    body: `<div class="chooser-grid"><div class="chooser-left"><p>Same plan, example team, last ${report.days} days</p><ul class="providers">${providers}</ul></div>
<div class="chooser-right"><p>The plan:</p><p class="plan">${esc(hero.detail ?? "")}</p><p>Public rates from each provider.</p></div></div>`,
    status: ["5 providers", "same token counts assumed"],
  });

  const about = win({
    id: "about",
    title: "costmaxxing Info",
    className: "about",
    body: `<div class="about-head">${icon("computer")}<div><p class="about-name">costmaxxing</p><p>Chrome extension, open source (MIT)</p></div></div>
<dl class="facts"><dt>Size</dt><dd>${zipSize}</dd><dt>Where</dt><dd>Your browser</dd><dt>Permissions</dt><dd>claude.ai, models.dev</dd><dt>Uploads</dt><dd>None</dd><dt>Telemetry</dt><dd>None</dd></dl>`,
  });

  const infos = [
    info("info-price", "Info: Anthropic price", [
      ["What", `The example team's last ${report.days} days at Anthropic's API rates: ${exactUsd(hero.price)}.`],
      ["From", `A synthetic spend report: ${count(report.users ?? 0)} people, ${count(report.requests)} requests, ${count(report.tokens)} tokens.`],
      ["Rates", "models.dev, per million tokens, for each model the team used."],
      ["Math", "Uncached input, output, cache reads, and cache writes, each times its rate."],
    ]),
    info("info-alt", "Info: open-weight price", [
      ["What", `The same tokens on open-weight models: ${exactUsd(hero.alt)}.`],
      ["Plan", esc(hero.detail ?? "")],
      ["Assumes", "The same token counts on every model."],
    ]),
    info("info-savings", "Info: savings", [
      ["Month", `${usd(hero.month)} saved over the last ${report.days} days.`],
      ["Year", `${usd(hero.year)}: the ${report.days}-day savings, times 365 / ${report.days}.`],
      ["Share", `${percent(hero.percent)} of the price at Anthropic's API rates.`],
    ]),
    info("info-bench", "Info: SWE-bench Verified", [
      ["What", "500 real GitHub issues. The model must produce a patch that passes the project's tests."],
      ["Scores", SWE_BENCH.rows.map((m) => `${esc(m.name)} ${m.score.toFixed(1)}%`).join(", ")],
      ["Source", `<a href="${SWE_BENCH.url}">${SWE_BENCH.source}</a>, ${SWE_BENCH.harness} harness, updated ${SWE_BENCH.updated}.`],
      ["Caveat", "Claude still leads on the hardest long-horizon agent benchmarks."],
    ]),
    info("info-seats", "Info: seats", [
      ["Seats", "Premium $125 and Standard $25 a month on monthly billing."],
      ["Estimate", "Anyone with Fable usage is counted Premium, everyone else Standard. The members export makes it exact."],
      ["Subsidy", "What the usage is worth at API prices, divided by what the seats cost."],
    ]),
  ].join("");

  const zipNote = install.zip
    ? `<section class="window info" id="info-zip" role="dialog" aria-label="Installing from the zip" hidden>
<div class="titlebar"><button class="close" type="button" aria-label="Close"></button><span class="title">Installing</span></div>
<div class="body"><p>costmaxxing-extension.zip is downloading. Unzip it, open <code>chrome://extensions</code>, turn on Developer mode, and choose Load unpacked.</p><p>Your bill opens as soon as it loads.</p></div>
</section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>costmaxxing · how much your team saves on open-weight models</title>
<meta name="description" content="How much can your team save by moving from Anthropic to open-weight models? One click prices your claude.ai team's real usage, in your browser." />
<meta name="theme-color" content="#2e1065" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://costmaxxing.dev/" />
<meta property="og:title" content="costmaxxing" />
<meta property="og:description" content="How much can your team save by moving from Anthropic to open-weight models? One click prices your claude.ai team's real usage, in your browser." />
<meta property="og:image" content="https://costmaxxing.dev/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" href="favicon.png" />
<link rel="preload" href="fonts/jersey-15.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="fonts/geist-pixel.woff2" as="font" type="font/woff2" crossorigin />
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&!sessionStorage.getItem("booted")&&innerWidth>=1100)document.documentElement.classList.add("booting")</script>
<style>${css}</style>
</head>
<body>
${SPRITE}
<div class="boot" aria-hidden="true"><div class="boot-icon">${icon("computer")}</div><div class="welcome">Welcome to costmaxxing.</div></div>
<div class="screen">
<header class="menubar">
<nav aria-label="Menu">
<div class="menu-group"><button class="menu-title logo" type="button" aria-expanded="false" aria-label="costmaxxing">${icon("logo")}</button>
<div class="menu" hidden><a href="#about">About costmaxxing…</a></div></div>
<div class="menu-group"><button class="menu-title" type="button" aria-expanded="false">File</button>
<div class="menu" hidden><a href="${esc(install.href)}"${zipAttrs}>${esc(install.label)}…</a><button type="button" data-open="bill">Open Team Bill</button></div></div>
</nav>
<div class="menubar-right"><a class="menubar-cta" href="${esc(install.href)}"${zipAttrs}>${install.zip ? "Download" : "Add to Chrome"}</a><a href="https://github.com/nahoc/costmaxxing-v2">GitHub</a></div>
</header>
<main>
<div class="desktop desktop-1">
<ul class="icons" aria-label="Desktop">${icons}</ul>
${dialog}
${bill}
${paint}
</div>
<div class="desktop desktop-2">
${subsidy}
${bench}
${how}
${chooser}
${about}
</div>
<section class="shutdown" id="shutdown" aria-labelledby="shutdown-title">
<div class="shutdown-box"><h2 id="shutdown-title">What will you do when the subsidies end?</h2>${cta}</div>
<p class="colophon">Made with ♥︎ by Cohan Carpentier. Open source under the MIT license. <span>Wall Street, 1915, by Paul Strand, public domain.</span></p>
</section>
</main>
${infos}${zipNote}
</div>
<script>${js}</script>
</body>
</html>
`;
}
