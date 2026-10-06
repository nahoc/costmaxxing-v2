import { byFamily, count, dollars, escapeHtml as esc, percent, plural, usd, type Report } from "@costmaxxing/core";
import { icon, SPRITE } from "../../world/icons.ts";
import {
  addBackfill,
  addLive,
  createTeam,
  deleteTeam,
  isAdmin,
  monthTotals,
  movedFor,
  overLimit,
  parsePricing,
  parseUpload,
  readRecords,
  rotateTeam,
  sessionCount,
  setPricing,
  teamMeta,
  teamReport,
  teamSlug,
  type Redis,
} from "./teams.ts";

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

function stats(report: Report): string {
  const cells: [string, string][] = [
    [count(report.users ?? 0), report.users === 1 ? "person" : "people"],
    [count(report.sessions ?? 0), report.sessions === 1 ? "session" : "sessions"],
    [count(report.requests), "requests"],
    [count(report.tokens), "tokens"],
  ];
  return `<dl class="stats">${cells.map(([n, label]) => `<div><dt>${n}</dt><dd>${label}, last 30 days</dd></div>`).join("")}</dl>`;
}

function forecast(report: Report): string {
  const rows = report.forecast
    .map(
      (f) =>
        `<tr><td>At the ${esc(f.label)} pace</td><td class="num">${usd(f.month.price)}</td><td class="num">${usd(f.month.alt)}</td><td class="num">${usd(f.year.price - f.year.alt)}</td></tr>`,
    )
    .join("");
  return `<table class="sheet"><thead><tr><th>Pace</th><th class="num">API price a month</th><th class="num">Open&#8209;weight a month</th><th class="num">Savings a year</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function tools(report: Report): string {
  const rows = report.byHarness ?? [];
  if (rows.length < 2) return "";
  return `<h2>By tool, last 30 days</h2><table class="sheet"><thead><tr><th>Tool</th><th class="num">Requests</th><th class="num">API price</th><th class="num">Open&#8209;weight cost</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${esc(row.label)}</td><td class="num">${count(row.requests)}</td><td class="num">${usd(row.price)}</td><td class="num">${usd(row.alt)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function models(report: Report): string {
  const rows = byFamily(report.models)
    .sort((a, b) => b.price / Math.max(1, b.requests) - a.price / Math.max(1, a.requests))
    .map((row) => `<tr><td>${esc(row.label)}</td><td class="num">${count(row.requests)}</td><td class="num">${usd(row.price)}</td><td>${esc(row.replacement ?? "")}</td><td class="num"><strong>${usd(row.price - row.alt)}</strong></td></tr>`)
    .join("");
  return `<table class="sheet"><thead><tr><th>Model</th><th class="num">Requests</th><th class="num">At API price</th><th>If replaced by</th><th class="num">Would save you</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function frame(title: string, body: string, css: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · costmaxxing</title><link rel="icon" href="/favicon.png"><style>${css}</style><script defer src="/_vercel/insights/script.js"></script></head>
<body>${SPRITE}<header class="menubar"><nav><a class="menu-title logo" href="/" aria-label="costmaxxing">${icon("logo")}</a></nav><div class="menubar-right"><a href="https://github.com/nahoc/costmaxxing-v2">GitHub</a></div></header>
<main class="desk"><article class="window team active"><div class="titlebar"><span class="title">${esc(title)} · open&#8209;weight savings</span></div><div class="body">${body}</div></article></main></body></html>`;
}

export function missingPage(css: string): string {
  return frame(
    "No team here",
    `<h1>No team has this ID.</h1>
<p>Check the link you were sent. To start a team of your own, run:</p><pre class="cmd"><code>npx costmaxxing</code></pre>`,
    css,
  );
}

export function teamPage(id: string, team: string, month: Report, all: Report, css: string): string {
  const join = `<div class="cmd"><code>npx costmaxxing ${esc(id)}</code><button class="copy" type="button" onclick="navigator.clipboard.writeText(this.previousSibling.textContent).then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1600)})">Copy</button></div>`;
  const body =
    all.requests === 0
      ? `<h1>No usage for ${esc(team)} yet.</h1>
<p>Everyone on the team runs this once. Their Claude Code then reports token counts here, and the savings show under their prompt.</p>${join}`
      : `<h1>${esc(team)} could save ${usd(month.hero.year)} a&nbsp;year on open&#8209;weight models.</h1>
<p>Compared with ${esc(month.hero.detail ?? month.hero.name)}. Everything recorded so far, over ${plural(all.days, "day")}: ${dollars(all.hero.price)} at API prices, ${dollars(all.hero.alt)} on open&#8209;weight models.</p>
${figures(month)}
${stats(month)}
<h2>Forecast</h2>
${forecast(month)}
${tools(month)}
<h2>Models, last 30 days</h2>
${models(month)}
<h2>Join this team</h2>${join}`;
  return frame(team, body, css);
}

export async function handle(request: Request, redis: Redis, now: number, css: string): Promise<Response> {
  const path = new URL(request.url).searchParams.get("p") ?? "";
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0]?.trim() ?? "local";
  const [raw = "", action = ""] = path.split("/");
  const notFound = async () => {
    if (await overLimit(redis, `miss:${ip}`, 30, now)) return json({ error: "slow down" }, 429);
    return action === "page"
      ? new Response(missingPage(css), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } })
      : json({ error: "no team has this ID" }, 404);
  };
  if (raw === "" && request.method === "POST") {
    if (await overLimit(redis, `new:${ip}`, 5, now)) return json({ error: "slow down" }, 429);
    let body: { name?: unknown; pricing?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {}
    return json(await createTeam(redis, String(body.name ?? ""), parsePricing(body.pricing), now), 201);
  }
  const team = teamSlug(raw);
  const meta = team ? await teamMeta(redis, team) : undefined;
  if (team && !meta && (action === "usage" || action === "backfill") && request.method === "POST") {
    const sent = await upload(request);
    const moved = sent ? await movedFor(redis, team, sent.user) : undefined;
    if (moved) return json({ moved }, 410);
  }
  if (!team || !meta) return notFound();
  if (action === "rotate" || action === "delete" || action === "pricing") {
    if (request.method !== "POST") return json({ error: "POST" }, 405);
    const key = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
    if (!(await isAdmin(meta, key))) {
      if (await overLimit(redis, `miss:${ip}`, 30, now)) return json({ error: "slow down" }, 429);
      return json({ error: "wrong admin key" }, 401);
    }
    if (action === "rotate") return json({ id: await rotateTeam(redis, team, meta) });
    if (action === "delete") return (await deleteTeam(redis, team), json({ deleted: team }));
    let body: { pricing?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {}
    const next = await setPricing(redis, team, meta, parsePricing(body.pricing));
    return json({ pricing: next.pricing ?? null });
  }
  if (action === "usage" || action === "backfill") {
    if (request.method !== "POST") return json({ error: "POST" }, 405);
    if (await overLimit(redis, `write:${ip}`, 600, now)) return json({ error: "slow down" }, 429);
    const sent = await upload(request);
    if (!sent) return json({ error: 'send {"user": "...", "records": [...]}' }, 400);
    const counted = action === "usage" ? (await addLive(redis, team, sent), sent.records.length) : await addBackfill(redis, team, sent, now);
    return json({ counted, name: meta.name, pricing: meta.pricing ?? null, ...(await monthTotals(redis, team, now, meta.pricing)) });
  }
  if (action === "") return json({ name: meta.name, pricing: meta.pricing ?? null, ...(await monthTotals(redis, team, now, meta.pricing)) });
  if (action === "page") {
    const [records, sessions] = await Promise.all([readRecords(redis, team, 366, now), sessionCount(redis, team, 30, now)]);
    const month = teamReport(records, 30, now, meta.pricing);
    const all = teamReport(records, 366, now, meta.pricing);
    const first = Math.min(...records.map((r) => r.time));
    const days = records.length > 0 ? Math.round((now - first) / 86_400_000) + 1 : 0;
    return new Response(teamPage(team, meta.name, { ...month, sessions }, { ...all, days }, css), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": records.length > 0 ? "private, max-age=60" : "no-store", "x-robots-tag": "noindex" },
    });
  }
  return json({ error: "not found" }, 404);
}
