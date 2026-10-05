import {
  buildReport,
  parseMembers,
  parseModelsDev,
  parseSpendReport,
  priceBook,
  type ModelPrice,
  type Report,
} from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };

export interface Org {
  uuid: string;
  name: string;
}

export type TeamResult =
  | { kind: "report"; report: Report; csv: string; filename: string }
  | { kind: "signed-out" }
  | { kind: "not-owner" }
  | { kind: "failed"; request: string; status: string };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Step {
  progress: number;
  text: string;
}

const CLAUDE = "https://claude.ai/api/organizations";

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lastThirtyDays(now: Date): { from: string; to: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 29);
  return { from: localDate(from), to: localDate(to) };
}

function orgs(value: unknown): Org[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { uuid, name } = entry as Record<string, unknown>;
    return typeof uuid === "string" ? [{ uuid, name: typeof name === "string" ? name : uuid }] : [];
  });
}

async function catalog(get: Fetch): Promise<ModelPrice[]> {
  try {
    const response = await get("https://models.dev/api.json");
    const prices = response.ok ? parseModelsDev(await response.json()) : [];
    if (prices.length > 0) return prices;
  } catch {}
  return parseModelsDev(snapshot);
}

export async function teamReport(get: Fetch, now: Date, onStep: (step: Step) => void = () => {}): Promise<TeamResult> {
  const claude = (url: string) => get(url, { credentials: "include" });
  const prices = catalog(get);
  onStep({ progress: 0.1, text: "Finding your organization…" });
  const list = await claude(CLAUDE).catch(() => undefined);
  if (!list) return { kind: "failed", request: "GET /api/organizations", status: "network error" };
  if (list.status === 401 || list.status === 403) return { kind: "signed-out" };
  if (!list.ok) return { kind: "failed", request: "GET /api/organizations", status: String(list.status) };
  const { from, to } = lastThirtyDays(now);
  let failure: TeamResult | undefined;
  for (const org of orgs(await list.json().catch(() => undefined))) {
    const request = `GET /api/organizations/${org.uuid}/analytics/spend-report-export`;
    onStep({ progress: 0.35, text: `Fetching the spend report for ${org.name}…` });
    const response = await claude(`${CLAUDE}/${org.uuid}/analytics/spend-report-export?start_date=${from}&end_date=${to}`).catch(
      () => undefined,
    );
    if (response?.status === 401) return { kind: "signed-out" };
    if (response?.status === 403) continue;
    if (!response?.ok) {
      failure ??= { kind: "failed", request, status: response ? String(response.status) : "network error" };
      continue;
    }
    const csv = await response.text();
    let rows: ReturnType<typeof parseSpendReport>;
    try {
      rows = parseSpendReport(csv);
    } catch {
      failure ??= { kind: "failed", request, status: "not a spend report" };
      continue;
    }
    onStep({ progress: 0.6, text: "Checking seats…" });
    const members = await claude(`${CLAUDE}/${org.uuid}/members/export`).catch(() => undefined);
    const seats = members?.ok ? parseMembers(await members.text()) : undefined;
    onStep({ progress: 0.8, text: "Loading prices from models.dev…" });
    const book = priceBook(await prices);
    onStep({ progress: 0.95, text: `Pricing ${rows.reduce((n, row) => n + row.requests, 0).toLocaleString("en-US")} requests…` });
    const report = buildReport({
      dataset: { kind: "spend", rows, from, to, org: org.name, recent: true },
      book,
      seats,
    });
    return { kind: "report", report, csv, filename: `spend-report-${org.uuid}-${from}-to-${to}.csv` };
  }
  return failure ?? { kind: "not-owner" };
}
