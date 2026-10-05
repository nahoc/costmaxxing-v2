import { byFamily, comparisonText, count, escapeHtml as esc, exactUsd, percent, usd } from "@costmaxxing/core";
import type { Example } from "./example.ts";
import { PRICE_LADDER, SWE_BENCH } from "./claims.ts";
import { SEAT } from "./example.ts";
import { icon, SPRITE, type IconName } from "../../world/icons.ts";

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

function command(): string {
  return `<div class="command"><code>npx costmaxxing</code></div>`;
}

const copy = `<button class="button default" type="button" data-copy="">Copy Command</button>`;

export function renderPage({ example, css, js }: { example: Example; css: string; js: string }): string {
  const { report } = example;
  const { hero } = report;
  const team = "acme-7kq3x-m9pz2";
  const [best, glm, fable, flash] = SWE_BENCH.rows;
  if (!best || !glm || !fable || !flash) throw new Error("SWE_BENCH needs four rows");
  const benchLine = `Almost the same intelligence at a fraction of the price: ${glm.name} scores ${glm.score.toFixed(1)}% on SWE-bench Verified. ${fable.name} scores ${fable.score.toFixed(1)}%.`;
  const topOutput = Math.max(...PRICE_LADDER.map((m) => m.output));

  const dialog = `<section class="alert hero" id="hero" aria-labelledby="hero-title">
<div class="alert-icon">${icon("computer")}</div>
<div class="alert-text"><h1 id="hero-title">How much can your team save by moving from Anthropic to open&#8209;weight models?</h1>
<p>Run it to start your team. It prints a private team ID to share, and everyone who joins sees the open&#8209;weight price of every Claude Code request under the prompt. Your team page adds it all up.</p>
${command()}
<p class="claim">${figure("info-bench", esc(benchLine))}</p></div>
<div class="buttons">${copy}</div>
</section>`;

  const models = byFamily(report.models)
    .map((row) => `<tr><td>${esc(row.label)}</td><td class="num">${usd(row.price)}</td><td class="num">${usd(row.alt)}</td></tr>`)
    .join("");
  const teamPage = win({
    id: "team",
    title: "Team Page",
    className: "teampage",
    label: "An example team page with synthetic data",
    body: `<p class="savings">Acme Robotics could save ${figure("info-savings", `<span class="big">${usd(hero.year)}</span>`)} a&nbsp;year on open&#8209;weight models.</p>
<div class="figures">
${figure("info-price", `<span class="mid">${usd(hero.price)}</span> at API prices`)}
${figure("info-alt", `<span class="mid">${usd(hero.alt)}</span> on open&#8209;weight models`)}
${figure("info-savings", `<span class="mid">Up to ${percent(hero.percent)}</span> you could save`)}
</div>
<table class="models"><thead><tr><th scope="col">Model, last 30 days</th><th scope="col" class="num">API price</th><th scope="col" class="num">Open&#8209;weight</th></tr></thead><tbody>${models}</tbody></table>`,
    status: [`costmaxxing.dev/${team}`, "example"],
  });

  const paint = win({
    id: "paint",
    title: "Wall Street, 1915",
    className: "paint",
    closed: true,
    body: `<img src="wall-street-1915.png" width="560" height="441" alt="Paul Strand's 1915 photograph of Wall Street: tiny figures walk past the enormous dark windows of a bank, dithered to two colors." />`,
    status: ["Paul Strand, 1915", "public domain"],
  });

  const desktopIcons: [string, IconName, string][] = [
    ["team", "bill", "Team Page"],
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
<table class="ladder"><caption>Price per million output tokens</caption><tbody>${PRICE_LADDER.map(
      (m) => `<tr><td>${esc(m.name)}</td><td>${meter(m.output / topOutput, m.anthropic)}</td><td class="num">${rate(m.output)}</td></tr>`,
    ).join("")}</tbody></table>
<p>A $${SEAT.Premium} Premium seat hides these prices. For a busy engineer, the usage inside it can be worth several times the seat. That gap is a subsidy, and subsidies rarely last.</p>`,
  });

  const bench = win({
    id: "bench",
    title: "Benchmarks",
    className: "bench",
    body: `<p class="lead">Almost the same intelligence at a fraction of the price.</p>
<p>On SWE-bench Verified, 500 real GitHub issues, ${esc(glm.name)} trails ${esc(best.name)} by ${(best.score - glm.score).toFixed(1)} points and beats ${esc(fable.name)}.</p>
<table class="scores"><thead><tr><th scope="col"><span class="sr">Model</span></th><th scope="col" class="num">Score</th><th scope="col"><span class="sr">Score bar</span></th><th scope="col" class="num">Output</th></tr></thead><tbody>${SWE_BENCH.rows
      .map(
        (m) =>
          `<tr><td>${esc(m.name)}</td><td class="num">${m.score.toFixed(1)}%</td><td>${meter(m.score / 100, m.anthropic)}</td><td class="num">${rate(m.output)}</td></tr>`,
      )
      .join("")}</tbody></table>
<p><a href="${SWE_BENCH.url}">${SWE_BENCH.source}</a>, updated ${SWE_BENCH.updated}. Output is per million tokens. Claude still leads on the hardest long agent tasks.</p>`,
  });

  const how = win({
    id: "how",
    title: "How It Works",
    className: "how",
    body: `<table class="list"><tbody>
<tr><td>${icon("floppy")}Start a team</td><td>npx costmaxxing names your team and gives you a private ID to share.</td></tr>
<tr><td>${icon("computer")}Everyone joins</td><td>npx costmaxxing &lt;team-id&gt; installs the mod and adds up to a year of history.</td></tr>
<tr><td>${icon("bill")}Watch it add up</td><td>Every request shows its open&#8209;weight price under the prompt, and the team page totals it.</td></tr>
</tbody></table>`,
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
    body: `<p>The example team's switch, priced at each provider:</p>
<ul class="providers">${providers}</ul>
<p class="plan-note">${esc(hero.detail ?? "")}</p>`,
  });


  const infos = [
    info("info-price", "Info: Anthropic price", [
      ["What", `The example team's last ${report.days} days at Anthropic's API rates: ${exactUsd(hero.price)}.`],
      ["From", `Synthetic usage: ${count(report.users ?? 0)} people, ${count(report.requests)} requests, ${count(report.tokens)} tokens.`],
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
  ].join("");

  const description = "How much can your team save by moving from Anthropic to open-weight models? One command adds the savings to every Claude Code prompt and adds them up on your team's page.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>costmaxxing · how much your team saves on open-weight models</title>
<meta name="description" content="${description}" />
<meta name="theme-color" content="#2e1065" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://costmaxxing.dev/" />
<meta property="og:title" content="costmaxxing" />
<meta property="og:description" content="${description}" />
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
<div class="menu" hidden><a href="https://github.com/nahoc/costmaxxing-v2">costmaxxing on GitHub…</a></div></div>
<div class="menu-group"><button class="menu-title" type="button" aria-expanded="false">File</button>
<div class="menu" hidden><button type="button" data-copy="">Copy Install Command</button><button type="button" data-open="team">Open Team Page</button></div></div>
</nav>
<div class="menubar-right"><button class="menubar-cta" type="button" data-copy="">Copy command</button><a href="https://github.com/nahoc/costmaxxing-v2">GitHub</a></div>
</header>
<main>
<div class="desktop desktop-1">
<ul class="icons" aria-label="Desktop">${icons}</ul>
${dialog}
${teamPage}
${paint}
</div>
<div class="desktop desktop-2">
${subsidy}
${bench}
${how}
${chooser}
</div>
<section class="shutdown" id="shutdown" aria-labelledby="shutdown-title">
<div class="shutdown-box"><h2 id="shutdown-title">What will you do when the subsidies end?</h2>${command()}${copy}</div>
<p class="colophon">Made with ♥︎ by Cohan Carpentier. Open source under the MIT license. <span>Wall Street, 1915, by Paul Strand, public domain.</span></p>
</section>
</main>
${infos}
</div>
<script>${js}</script>
</body>
</html>
`;
}
