import { parseModelsDev, priceBook, type RequestRecord, type TeamTotals } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
import { add, asTally, asTeam, localDay, NONE, priceRecord, statusText, stepRecord, type StepUsage, type Tally } from "./meter.ts";

interface Mods {
  session: { id: () => Promise<string> };
  clock: { now: () => Promise<number>; after: (ms: number, run: () => Promise<void>) => unknown };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    keys: () => Promise<string[]>;
  };
  http: {
    fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text: string }>;
  };
  ui: { invalidate: (event: "ui.render") => void };
}

interface StepInput {
  turnId: string;
  index: number;
  agentId?: string;
}

interface StepResult {
  usage: StepUsage | null;
}

interface HintEvent {
  props: { hint: string };
}

interface On {
  (event: "session.start", hook: ($: Mods, e: unknown, next: (e: unknown) => Promise<unknown>) => Promise<unknown>): void;
  (
    event: "turn.step",
    hook: ($: Mods, e: StepInput, next: (e: StepInput) => AsyncGenerator<unknown, StepResult>) => AsyncGenerator<unknown, StepResult>,
  ): void;
  (event: "ui.render", matcher: { component: "PromptHint" }, hook: ($: Mods, e: HintEvent, next: (e: HintEvent) => Promise<unknown>) => Promise<unknown>): void;
}

const book = priceBook(parseModelsDev(snapshot));
const DAY = 86_400_000;
const KEY = /^(\d{4}-\d{2}-\d{2}) (.+)$/;

const team = { server: "", token: "", user: "" };
let sessionId = "";
let session = NONE;
let month = NONE;
let totals: TeamTotals | "unreachable" | undefined;
let unsaved = new Map<string, Tally>();
let pending: RequestRecord[] = [];
let queue = Promise.resolve();

async function load($: Mods): Promise<void> {
  sessionId = await $.session.id();
  const oldest = localDay((await $.clock.now()) - 29 * DAY);
  let ours = NONE;
  let all = NONE;
  for (const key of await $.store.keys()) {
    const match = KEY.exec(key);
    if (!match) continue;
    if ((match[1] ?? "") < oldest) {
      await $.store.delete(key);
      continue;
    }
    const tally = asTally(await $.store.get(key));
    all = add(all, tally);
    if (match[2] === sessionId) ours = add(ours, tally);
  }
  session = ours;
  month = all;
  $.ui.invalidate("ui.render");
}

async function flush($: Mods): Promise<void> {
  const days = unsaved;
  unsaved = new Map();
  for (const [key, tally] of days) await $.store.set(key, add(asTally(await $.store.get(key)), tally));
  if (!team.server || !team.token) return;
  const records = pending.splice(0);
  try {
    const response = await $.http.fetch(`${team.server}/costmaxxing/usage`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-costmaxxing-token": team.token, "x-costmaxxing-user": team.user || "unknown" },
      body: JSON.stringify({ records }),
    });
    totals = (response.ok && asTeam(response.text)) || "unreachable";
    if (totals === "unreachable") pending = [...records, ...pending].slice(-5000);
  } catch {
    totals = "unreachable";
    pending = [...records, ...pending].slice(-5000);
  }
  $.ui.invalidate("ui.render");
}

function save($: Mods): void {
  queue = queue.then(() => flush($)).catch(() => undefined);
}

export function register(on: On, options: Record<string, unknown>): void {
  const option = (name: string) => (typeof options[name] === "string" ? (options[name] as string).trim() : "");
  team.server = option("server").replace(/\/+$/, "");
  team.token = option("token");
  team.user = option("user");

  on("session.start", async ($, e, next) => {
    await load($);
    if (team.server && team.token) $.clock.after(0, async () => save($));
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    const result = yield* next(e);
    if (!result?.usage) return result;
    const time = await $.clock.now();
    const subagent = e.agentId !== undefined;
    const record = stepRecord(result.usage, { id: `${sessionId}/${e.turnId}/${e.agentId ?? "main"}/${e.index}`, session: sessionId, subagent, time });
    const tally = priceRecord(record, book);
    session = add(session, tally);
    month = add(month, tally);
    const key = `${localDay(time)} ${sessionId}`;
    unsaved.set(key, add(unsaved.get(key) ?? NONE, tally));
    if (team.server && team.token) pending.push(record);
    $.ui.invalidate("ui.render");
    $.clock.after(0, async () => save($));
    return result;
  });

  on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
    const line = statusText(session, month, totals);
    return next({ ...e, props: { ...e.props, hint: e.props.hint ? `${e.props.hint} · ${line}` : line } });
  });
}
