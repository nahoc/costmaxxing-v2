import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestRecord } from "@costmaxxing/core";
import { claudeLine } from "../../core/test/fixtures.ts";
import { statusParts, type Tone } from "../../mod/src/meter.ts";
import { teamPage } from "../src/api.ts";
import { teamReport } from "../src/teams.ts";

const CHROME = process.env.CHROME ?? execFileSync("sh", ["-c", "ls -d ~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell | tail -1"], { encoding: "utf8" }).trim();
const here = (path: string) => new URL(path, import.meta.url).pathname;
const out = here("../../docs/screenshots/");
const work = await mkdtemp(join(tmpdir(), "costmaxxing-shots-"));
const ID = "acme-7kq3x-m9pz2";
const DAY = 86_400_000;
const now = Date.now();

const people = ["ada", "grace", "linus", "margaret", "ken", "barbara", "dennis", "frances", "edsger", "radia", "alan", "hedy"];
const mix: [RequestRecord["harness"], string, number][] = [
  ["Claude Code", "claude-opus-5-5", 34],
  ["Claude Code", "claude-sonnet-5", 18],
  ["Claude Code", "claude-haiku-4-5-20251001", 22],
  ["Claude Code", "claude-opus-5", 6],
  ["Codex", "gpt-6-sol", 9],
  ["Codex", "gpt-5.6-luna", 5],
];
const records: RequestRecord[] = [];
for (let day = 0; day < 140; day++) {
  if (new Date(now - day * DAY).getUTCDay() % 6 === 0) continue;
  people.forEach((user, u) => {
    if (day > 60 + u * 6) return;
    mix.forEach(([harness, model, base], m) => {
      const requests = Math.round(base * (0.6 + (((u + 3) * (day + 7) * (m + 5)) % 17) / 20));
      if (requests === 0) return;
      const codex = harness === "Codex";
      records.push({
        id: `${user}-${day}-${m}`,
        harness,
        model,
        time: now - day * DAY - 3_600_000,
        session: `${user}-${day}`,
        subagent: false,
        user,
        requests,
        tokens: {
          uncached: requests * (codex ? 4000 : 900),
          output: requests * (codex ? 1500 : 1800),
          cacheRead: requests * (codex ? 40_000 : 60_000),
          write5m: codex ? 0 : requests * 3000,
          write1h: 0,
        },
      });
    });
  });
}
const month = teamReport(records, 30, now);
const all = teamReport(records, 366, now);
const team = { days: 30, people: people.length, requests: month.requests, price: month.hero.price, alt: month.hero.alt };

const ESC = /\x1b\[([0-9;]*)m/g;
function ansiHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => line.slice(line.lastIndexOf("\r") + 1).replaceAll("\x1b[K", ""))
    .map((line) => {
      let html = "";
      let open = 0;
      let last = 0;
      for (const match of line.matchAll(ESC)) {
        html += esc(line.slice(last, match.index));
        last = (match.index ?? 0) + match[0].length;
        const code = match[1] ?? "";
        if (code === "0" || code === "") {
          html += "</span>".repeat(open);
          open = 0;
          continue;
        }
        const rgb = /^38;2;(\d+);(\d+);(\d+)$/.exec(code);
        const style = rgb
          ? `color:rgb(${rgb[1]},${rgb[2]},${rgb[3]})`
          : ({ "1": "font-weight:700", "2": "opacity:.55", "32": "color:#4eba65", "33": "color:#ffc107" } as Record<string, string>)[code];
        if (!style) continue;
        html += `<span style="${style}">`;
        open++;
      }
      return html + esc(line.slice(last)) + "</span>".repeat(open);
    })
    .join("\n");
}

function esc(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function terminal(title: string, body: string, width: number): string {
  return `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
.win{margin:24px;width:${width}px;border-radius:12px;background:#17151c;box-shadow:0 18px 50px rgba(20,10,40,.45),0 0 0 1px rgba(255,255,255,.08);overflow:hidden;font:14px/1.3 "SF Mono",Menlo,monospace;color:#e6e3ec}
.bar{display:flex;align-items:center;gap:8px;padding:11px 14px;background:#211e28;color:#8a8496;font:12px -apple-system,system-ui,sans-serif}
.bar i{width:12px;height:12px;border-radius:50%;display:inline-block}
.bar b{flex:1;text-align:center;font-weight:500;margin-right:52px}
pre{margin:0;padding:16px 20px 20px;font:inherit;white-space:pre}
.prompt{border:1px solid #4a4556;border-radius:6px;padding:6px 12px;margin-bottom:4px}
.hint{display:flex;justify-content:space-between;gap:24px;padding:0 4px}
a{color:#8d71d6}
</style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>${title}</b></div>${body}</div>`;
}

async function shoot(name: string, html: string, width: number, height: number): Promise<void> {
  const file = join(work, `${name}.html`);
  await writeFile(file, html);
  execFileSync(CHROME, [
    `--screenshot=${join(out, `${name}.png`)}`,
    `--window-size=${width},${height}`,
    "--force-device-scale-factor=2",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    `--user-data-dir=${join(work, "profile")}`,
    `file://${file}`,
  ], { stdio: "ignore" });
}

await mkdir(out, { recursive: true });

const TONES: Record<Tone, string> = {
  lead: "color:#b9a7ec",
  amount: "font-weight:700;color:#4eba65",
  label: "opacity:.55",
  divider: "color:#8d71d6",
  gain: "color:#4eba65",
  warn: "color:#ffc107",
};
const you = { requests: Math.round(team.requests / 9), price: team.price / 9, alt: team.alt / 9 };
const session = { requests: 61, price: 27.84, alt: 5.91 };
const line = statusParts(session, you, team, 1.12)
  .map(([text, tone]) => `<span style="${TONES[tone]}">${esc(text)}</span>`)
  .join("");
await shoot(
  "prompt-line",
  terminal(
    "claude",
    `<pre><span style="opacity:.55">⏺</span> Done. The retry now backs off exponentially and the flaky test passes 50/50 runs.

<div class="prompt">&gt; <span style="opacity:.4">Try "write a test for the parser"</span></div><div class="hint"><span style="opacity:.55">? for shortcuts</span><span>${line}<span style="color:#8d71d6"> │ </span><a>team page ↗</a>&nbsp;&nbsp;<b style="background:#8d71d6;color:#fff"> Try open-weight ↗ </b></span></div></pre>`,
    1500,
  ),
  1548,
  250,
);

const home = join(work, "home");
const claudeHome = join(work, "claude", "projects", "-repo");
await mkdir(claudeHome, { recursive: true });
await mkdir(join(work, "codex"), { recursive: true });
const usage = { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
await writeFile(
  join(claudeHome, "s.jsonl"),
  [1, 212].map((ago, i) => JSON.stringify({ ...JSON.parse(claudeLine({ requestId: `r${i}`, sessionId: "s", usage })), timestamp: new Date(now - ago * DAY).toISOString() })).join("\n"),
);
const fake = join(work, "claude-bin");
await writeFile(fake, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "2.1.289 (Claude Code)"; fi\ncat > /dev/null\n`);
await chmod(fake, 0o755);
const server = createServer((req, res) => {
  if (req.method === "GET") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: "Acme Robotics", ...team }));
  req.resume().on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ counted: 18_402, ...team })));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const cli = spawn(process.execPath, [here("../../cli/src/main.ts"), ID], {
  env: {
    PATH: process.env.PATH ?? "",
    FORCE_COLOR: "1",
    COSTMAXXING_HOME: home,
    COSTMAXXING_CLAUDE: fake,
    COSTMAXXING_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    CLAUDE_CONFIG_DIR: join(work, "claude"),
    CODEX_HOME: join(work, "codex"),
  },
});
let joined = "";
cli.stdout.on("data", (chunk: Buffer) => (joined += chunk));
await once(cli, "exit");
server.close();
const shown = ansiHtml(joined.replace(/http:\/\/127\.0\.0\.1:\d+/g, "https://costmaxxing.dev").trim());
await shoot("join", terminal("~", `<pre><span style="color:#4eba65">$</span> npx costmaxxing ${ID}\n\n${shown}</pre>`, 720), 768, 430);

await cp(here("../../world/fonts/"), join(work, "fonts"), { recursive: true });
const css = `${await readFile(here("../../world/world.css"), "utf8")}\n${await readFile(here("../src/team.css"), "utf8")}`;
await shoot("team-page", teamPage(ID, "Acme Robotics", { ...month, sessions: 2_318 }, { ...all, days: 140 }, css), 1280, 1350);

process.stdout.write(`wrote ${out}\n`);
