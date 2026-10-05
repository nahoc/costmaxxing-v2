import { byFamily, count, escapeHtml as esc, exactUsd, percent, usd, type Report } from "@openmaxxing/core";
import { icon, SPRITE } from "../../world/icons.ts";
import { addBackfill, addLive, monthTotals, parseUpload, readRecords, teamReport, teamSlug, type Redis } from "./teams.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function upload(request: Request): Promise<ReturnType<typeof parseUpload>> {
  try {
    return parseUpload(await request.json());
  } catch {
    return undefined;
  }
}

function figures(report: Report): string {
  const { hero } = report;
  return `<div class="figures">
<div><span class="mid">${usd(hero.price)}</span><span>at Anthropic's API prices</span></div>
<div><span class="mid">${usd(hero.alt)}</span><span>on open&#8209;weight models</span></div>
<div><span class="mid">Up to ${percent(hero.percent)}</span><span>you could save</span></div>
</div>`;
}

function models(report: Report): string {
  const rows = byFamily(report.models)
    .map((row) => `<tr><td>${esc(row.label)}</td><td class="num">${count(row.requests)}</td><td class="num">${usd(row.price)}</td><td>${esc(row.replacement ?? "")}</td><td class="num">${usd(row.alt)}</td></tr>`)
    .join("");
  return `<table class="sheet"><thead><tr><th>Model</th><th class="num">Requests</th><th class="num">API price</th><th>Replaced by</th><th class="num">Open&#8209;weight cost</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function teamPage(team: string, month: Report, all: Report, css: string): string {
  const join = `<pre class="cmd"><code>npx openmaxxing ${esc(team)}</code></pre>`;
  const body =
    all.requests === 0
      ? `<h1>No usage for ${esc(team)} yet.</h1>
<p>Everyone on the team runs this once. Their Claude Code then reports token counts here, and the savings show under their prompt.</p>${join}`
      : `<h1>${esc(team)} could save ${usd(month.hero.year)} a&nbsp;year on open&#8209;weight models.</h1>
<p>${count(month.users ?? 0)} ${month.users === 1 ? "person" : "people"} made ${count(month.requests)} Claude Code requests in the last 30 days. Everything recorded so far, over ${count(all.days)} days: ${exactUsd(all.hero.price)} at API prices, ${exactUsd(all.hero.alt)} on open&#8209;weight models.</p>
${figures(month)}
<h2>Models, last 30 days</h2>
${models(month)}
<h2>Add your Claude Code</h2>${join}
<p class="fine">Only model names and token counts reach this page. Anyone with the link can see it.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(team)} · openmaxxing</title><link rel="icon" href="/favicon.png"><style>${css}</style><script defer src="/_vercel/insights/script.js"></script></head>
<body>${SPRITE}<header class="menubar"><nav><a class="menu-title logo" href="/" aria-label="openmaxxing">${icon("logo")}</a></nav><div class="menubar-right"><a href="https://github.com/nahoc/openmaxxing">GitHub</a></div></header>
<main class="desk"><article class="window team active"><div class="titlebar"><span class="title">${esc(team)} · open&#8209;weight savings</span></div><div class="body">${body}</div></article></main></body></html>`;
}

export async function handle(request: Request, redis: Redis, now: number, css: string): Promise<Response> {
  const path = new URL(request.url).searchParams.get("p") ?? "";
  const [raw = "", action = ""] = path.split("/");
  const team = teamSlug(raw);
  if (!team) return action === "page" ? new Response("Not found", { status: 404 }) : json({ error: "team names are 3 to 40 lowercase letters, digits, or dashes" }, 400);
  if (action === "usage" || action === "backfill") {
    if (request.method !== "POST") return json({ error: "POST" }, 405);
    const sent = await upload(request);
    if (!sent) return json({ error: 'send {"user": "...", "records": [...]}' }, 400);
    const counted = action === "usage" ? (await addLive(redis, team, sent.user, sent.records), sent.records.length) : await addBackfill(redis, team, sent.user, sent.records, now);
    return json({ counted, ...(await monthTotals(redis, team, now)) });
  }
  if (action === "") return json(await monthTotals(redis, team, now));
  if (action === "page") {
    const records = await readRecords(redis, team, 366, now);
    const month = teamReport(records, 30, now);
    const all = teamReport(records, 366, now);
    const first = Math.min(...records.map((r) => r.time));
    const days = records.length > 0 ? Math.round((now - first) / 86_400_000) + 1 : 0;
    return new Response(teamPage(team, month, { ...all, days }, css), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, s-maxage=60" },
    });
  }
  return json({ error: "not found" }, 404);
}

