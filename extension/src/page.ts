import { renderHtml } from "@costmaxxing/core";
import { teamReport, type TeamResult } from "./team.ts";

const root = document.getElementById("root");
const full = document.body.dataset.page === "report";

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function message(result: Exclude<TeamResult, { kind: "report" }>): string {
  switch (result.kind) {
    case "signed-out":
      return '<p>Sign in to claude.ai in this browser, then click costmaxxing again.</p><p><a href="https://claude.ai/login" target="_blank">Open claude.ai</a></p>';
    case "not-owner":
      return "<p>The team report needs the Owner role on your claude.ai organization.</p><p>For your own Claude Code and Codex usage, run <code>npx costmaxxing</code> in a terminal.</p>";
    case "failed":
      return `<p>${escape(result.request)} failed (${escape(result.status)}).</p><p class="muted">Try again in a moment. Nothing was sent anywhere else.</p>`;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

async function show(): Promise<void> {
  if (!root) return;
  root.innerHTML = '<p class="status">Reading your team’s usage from claude.ai…</p>';
  const result = await teamReport((url, init) => fetch(url, init), new Date());
  if (result.kind !== "report") {
    root.innerHTML = `<div class="cmx">${message(result)}</div>`;
    return;
  }
  const csv = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" }));
  const actions = [
    full ? "" : '<a class="button" href="report.html" target="_blank">Open full report</a>',
    `<a class="button" href="${csv}" download="${escape(result.filename)}">Download CSV</a>`,
  ].join("");
  root.innerHTML = `<nav class="actions">${actions}</nav>${renderHtml(result.report, { full })}`;
}

void show();
