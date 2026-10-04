import { comparisonText, count, escapeHtml as esc, exactUsd, percent, seatText, usd } from "@costmaxxing/core";
import type { Example } from "./example.ts";
import { ICONS } from "./icons.ts";

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
  depth?: number;
  label?: string;
}

function win({ id, title, className, body, status, depth, label }: WindowSpec): string {
  return `<section class="window ${className}" id="${id}" aria-label="${esc(label ?? title)}"${depth ? ` data-depth="${depth}"` : ""}>
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

function figure(target: string, html: string, className = ""): string {
  return `<a class="figure ${className}" href="#${target}" data-info="${target}">${html}</a>`;
}

export function renderPage({ example, install, css, js, zipSize }: { example: Example; install: Install; css: string; js: string; zipSize: string }): string {
  const { report, people, subsidized } = example;
  const { hero } = report;
  const seats = report.seats ? seatText(report.seats) : "";
  const top = people.slice(0, 6);
  const most = Math.max(...top.map((p) => p.price));
  const savingsMonth = usd(hero.month);
  const cta = (extra = "") =>
    `<a class="button default${extra}" href="${esc(install.href)}"${install.zip ? ' download data-zip=""' : ""}>${esc(install.label)}</a>`;

  const readme = win({
    id: "readme",
    title: "Read Me",
    className: "readme active",
    body: `<h1>What would your Claude team cost at API&nbsp;prices?</h1>
<p class="lede">One click prices every person, product, and model in your claude.ai Team or Enterprise org, and shows what the same usage would cost on open&#8209;weight models.</p>
<p class="fine">For claude.ai Owners. It runs in your browser, and nothing is uploaded.</p>`,
    status: ["0K uploaded", "2 permissions", "1 extension"],
  });

  const bill = win({
    id: "bill",
    title: "Team Bill (example)",
    className: "bill",
    label: "Team Bill, an example team with synthetic data",
    body: `<p class="meta">${esc(report.org ?? "")} · last ${report.days} days · ${count(report.users ?? 0)} people · ${count(report.requests)} requests</p>
<div class="figures">
${figure("info-price", `<span class="big">${usd(hero.price)}</span><span class="cap">at API prices</span>`)}
<span class="vs" aria-hidden="true">vs</span>
${figure("info-alt", `<span class="big">${usd(hero.alt)}</span><span class="cap">on open&#8209;weight models</span>`)}
</div>
<p class="savings">${figure("info-savings", `${percent(hero.percent)} savings · ${usd(hero.year)} / year`)}</p>
<p class="seatline">${figure("info-seats", esc(seats))}</p>
<table class="people">
<caption>Top ${top.length} of ${people.length} people by price. <span class="zebra-chip" aria-hidden="true"></span> ${subsidized} use more than their seat costs.</caption>
<thead><tr><th scope="col">Person</th><th scope="col">Seat</th><th scope="col" class="num">Price</th><th scope="col"><span class="sr">Share of the bill</span></th></tr></thead>
<tbody>${top
      .map(
        (p) =>
          `<tr><td>${esc(p.name)}</td><td>${p.seat}</td><td class="num">${usd(p.price)}</td><td><span class="share"><span class="fill${p.subsidized ? " over" : ""}" style="width:${Math.max(4, Math.round((p.price / most) * 100))}%"></span></span>${p.subsidized ? '<span class="sr"> (uses more than the seat costs)</span>' : ""}</td></tr>`,
      )
      .join("")}</tbody>
</table>`,
    status: ["synthetic example", `${count(report.tokens)} tokens`, "priced by models.dev"],
  });

  const paint = win({
    id: "paint",
    title: "Wall Street, 1915",
    className: "paint",
    body: `<img src="wall-street-1915.png" width="560" height="441" alt="Paul Strand's 1915 photograph of Wall Street: tiny figures walk past the enormous dark windows of a bank, dithered to black and white pixels." />`,
    status: ["Paul Strand", "public domain"],
  });

  const alert = `<section class="alert" id="alert" aria-labelledby="alert-title">
<div class="alert-icon">${ICONS.bomb}</div>
<div class="alert-text"><h2 id="alert-title">What will you do when the subsidies end?</h2>
<p>Your team's real bill is one click away. Free, open source, and your data never leaves your browser.</p></div>
<div class="buttons"><button class="button" type="button" data-dismiss="alert">Not Now</button>${cta()}</div>
</section>`;

  const icons = [
    ["readme", ICONS.readMe, "Read Me"],
    ["bill", ICONS.bill, "Team Bill"],
    ["paint", ICONS.paint, "Wall Street"],
    ["install", ICONS.floppy, "Install"],
    ["trash", ICONS.trash, "Subsidies"],
  ]
    .map(([id, icon, label]) => `<li><button class="icon" type="button" data-open="${id}">${icon}<span>${label}</span></button></li>`)
    .join("");

  const how = win({
    id: "how",
    title: "Install costmaxxing",
    className: "how active-able",
    depth: 0.06,
    body: `<table class="list">
<thead><tr><th scope="col">Name</th><th scope="col">When</th><th scope="col">What happens</th></tr></thead>
<tbody>
<tr><td>${ICONS.floppy}Add to Chrome</td><td>Now</td><td>Your report opens in a new tab the moment the extension installs.</td></tr>
<tr><td>${ICONS.bill}Spend report</td><td>Next</td><td>It reads your org's spend report with your own claude.ai session and prices every row with models.dev.</td></tr>
<tr><td>${ICONS.readMe}The bill</td><td>Same tab</td><td>Cost by person, product, and model, next to the same usage on open&#8209;weight models.</td></tr>
<tr><td>${ICONS.paint}Download CSV</td><td>Any time</td><td>Keep the export, or run <code>npx costmaxxing import</code> on it.</td></tr>
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
    title: "Chooser",
    className: "chooser",
    depth: 0.12,
    body: `<div class="chooser-grid"><div class="chooser-left"><p class="pick-label">Same plan, example team, last ${report.days} days</p><ul class="providers">${providers}</ul></div>
<div class="chooser-right"><p>The plan:</p><p class="plan">${esc(hero.detail ?? "")}</p><p class="note">Made by Boundless, so Boundless's public rates are the default. Compare any provider on models.dev with <code>--vs</code>.</p></div></div>`,
    status: ["5 providers", "same token counts assumed"],
  });

  const notepad = win({
    id: "notepad",
    title: "Note Pad",
    className: "notepad",
    depth: 0.03,
    body: `<p>For your own Claude Code and Codex usage, run this in a terminal:</p>
<p class="command"><code>npx costmaxxing</code></p>
<button class="button" type="button" data-copy="npx costmaxxing">Copy</button>`,
    status: ["Page 1", "no install, no config"],
  });

  const about = win({
    id: "about",
    title: "costmaxxing Info",
    className: "about",
    depth: 0.09,
    body: `<div class="about-head">${ICONS.computer}<div><p class="about-name">costmaxxing</p><p>Chrome extension, open source (MIT)</p></div></div>
<dl class="facts"><dt>Size</dt><dd>${zipSize}</dd><dt>Where</dt><dd>Your browser</dd><dt>Permissions</dt><dd>claude.ai, models.dev</dd><dt>Uploads</dt><dd>None</dd><dt>Telemetry</dt><dd>None</dd><dt>Made by</dt><dd>Boundless</dd></dl>`,
  });

  const infos = [
    info("info-price", "Info: API price", [
      ["What", `The example team's last ${report.days} days priced at API rates: ${exactUsd(hero.price)}.`],
      ["From", `A synthetic spend report: ${count(report.users ?? 0)} people, ${count(report.requests)} requests, ${count(report.tokens)} tokens.`],
      ["Rates", "models.dev, per million tokens, for each model the team used."],
      ["Math", "Uncached input, output, cache reads, and cache writes, each times its rate."],
    ]),
    info("info-alt", "Info: open-weight price", [
      ["What", `The same tokens on open-weight models: ${exactUsd(hero.alt)}.`],
      ["Plan", esc(hero.detail ?? "")],
      ["Rates", "Boundless's public prices. The Chooser shows other providers."],
      ["Assumes", "The same token counts on every model."],
    ]),
    info("info-savings", "Info: savings", [
      ["Month", `${savingsMonth} saved over the last ${report.days} days.`],
      ["Year", `${usd(hero.year)}: the ${report.days}-day savings, times 365 / ${report.days}.`],
      ["Share", `${percent(hero.percent)} of the price at API rates.`],
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
<div class="body"><p>costmaxxing-extension.zip is downloading. Unzip it, open <code>chrome://extensions</code>, turn on Developer mode, and choose Load unpacked.</p><p>Your report opens as soon as it loads.</p></div>
</section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>costmaxxing · what your Claude team would cost at API prices</title>
<meta name="description" content="One click prices your claude.ai Team or Enterprise usage at API rates and shows what it would cost on open-weight models. Runs in your browser." />
<meta name="theme-color" content="#000000" />
<link rel="icon" href="icon.png" />
<link rel="preload" href="fonts/jersey-15.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="fonts/geist-pixel.woff2" as="font" type="font/woff2" crossorigin />
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&!sessionStorage.getItem("booted")&&innerWidth>=1100)document.documentElement.classList.add("booting")</script>
<style>${css}</style>
</head>
<body>
<div class="boot" aria-hidden="true"><div class="boot-icon">${ICONS.computer}</div><div class="welcome">Welcome to costmaxxing.</div></div>
<div class="screen">
<header class="menubar">
<nav aria-label="Menu">
<div class="menu-group"><button class="menu-title logo" type="button" aria-expanded="false" aria-label="costmaxxing">${ICONS.logo}</button>
<div class="menu" hidden><a href="#about">About costmaxxing…</a><a href="#readme">Read Me</a></div></div>
<div class="menu-group"><button class="menu-title" type="button" aria-expanded="false">File</button>
<div class="menu" hidden><a href="${esc(install.href)}"${install.zip ? ' download data-zip=""' : ""}>${esc(install.label)}…</a><button type="button" data-copy="npx costmaxxing">Copy npx costmaxxing</button></div></div>
<div class="menu-group"><button class="menu-title" type="button" aria-expanded="false">View</button>
<div class="menu" hidden><button type="button" data-action="cleanup">Clean Up Windows</button><a href="#how">How It Works</a><a href="#chooser">Providers</a></div></div>
<div class="menu-group"><button class="menu-title" type="button" aria-expanded="false">Special</button>
<div class="menu" hidden><button type="button" data-action="alert">Empty Subsidy…</button><a href="#shutdown">Shut Down</a></div></div>
</nav>
<a class="menubar-cta" href="${esc(install.href)}"${install.zip ? ' download data-zip=""' : ""}>${install.zip ? "Download" : "Install"}</a>
</header>
<main>
<div class="desktop desktop-1">
<ul class="icons" aria-label="Desktop">${icons}</ul>
${readme}
${alert}
${bill}
${paint}
</div>
<div class="desktop desktop-2">
${how}
${chooser}
${notepad}
${about}
</div>
<section class="shutdown" id="shutdown" aria-labelledby="shutdown-title">
<div class="shutdown-box"><h2 id="shutdown-title">It is now safe to look at your Claude bill.</h2>${cta(" big")}</div>
<p class="colophon">costmaxxing is open source under the MIT license. Made by Boundless; the default comparison uses Boundless's public rates. <span>Wall Street, 1915, by Paul Strand, public domain.</span> Every number on this page is computed by costmaxxing from a synthetic example team.</p>
</section>
</main>
${infos}${zipNote}
</div>
<script>${js}</script>
</body>
</html>
`;
}
