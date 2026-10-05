import { parseModelsDev, priceBook, type PriceBook, type RequestRecord, type TeamPricing } from "@costmaxxing/core";
import snapshot from "@costmaxxing/core/snapshot" with { type: "json" };
import { add, asTally, asTeam, localDay, NONE, priceRecord, statusParts, stepRecord, type StepUsage, type Tally, type TeamState, type Tone } from "./meter.ts";

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
  ui: { invalidate: (event: "ui.render") => void; resolve: (e: HintEvent) => Elements };
}

type Element = unknown;
interface Elements {
  Box: (props: Record<string, unknown>) => Element;
  Text: (props: Record<string, unknown>) => Element;
  Link: (props: Record<string, unknown>) => Element;
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
  (event: "session.end", hook: ($: Mods, e: unknown, next: (e: unknown) => Promise<unknown>) => Promise<unknown>): void;
  (event: "session.start", hook: ($: Mods, e: unknown, next: (e: unknown) => Promise<unknown>) => Promise<unknown>): void;
  (
    event: "turn.step",
    hook: ($: Mods, e: StepInput, next: (e: StepInput) => AsyncGenerator<unknown, StepResult>) => AsyncGenerator<unknown, StepResult>,
  ): void;
  (event: "ui.render", matcher: { component: "PromptHint" }, hook: ($: Mods, e: HintEvent, next: (e: HintEvent) => Promise<unknown>) => Promise<unknown>): void;
}

const catalog = parseModelsDev(snapshot);
let book: PriceBook = priceBook(catalog);
let pricing: TeamPricing | undefined;

function usePricing(next: TeamPricing | undefined): void {
  pricing = next ?? undefined;
  book = priceBook(catalog, pricing?.prices ?? {});
}
const DAY = 86_400_000;
const KEY = /^(\d{4}-\d{2}-\d{2}) (.+)$/;

const HOSTED = "https://costmaxxing.dev";
const GAP = 60_000;

const team = { name: "", option: "", server: "", token: "", user: "" };
let lastSent = 0;
let waiting = false;
let sessionId = "";
let session = NONE;
let month = NONE;
let totals: TeamState;
let unsaved = new Map<string, Tally>();
let pending: RequestRecord[] = [];
let queue = Promise.resolve();
let gain = { amount: 0, until: 0 };

const TONES: Record<Tone, Record<string, unknown>> = {
  brand: { bold: true, color: "#ffffff", backgroundColor: "#8d71d6" },
  amount: { bold: true, color: "success" },
  label: { dimColor: true },
  divider: { color: "#8d71d6" },
  gain: { color: "success" },
  warn: { color: "warning" },
};

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
  usePricing(((await $.store.get("pricing")) ?? undefined) as TeamPricing | undefined);
  const moved = (await $.store.get("team-moved")) as { from?: string; to?: string } | undefined;
  if (team.option && moved?.from === team.option && moved.to) team.name = moved.to;
  $.ui.invalidate("ui.render");
}

const reporting = () => team.name !== "" || (team.server !== "" && team.token !== "");

async function flush($: Mods, force: boolean): Promise<void> {
  const days = unsaved;
  unsaved = new Map();
  for (const [key, tally] of days) await $.store.set(key, add(asTally(await $.store.get(key)), tally));
  if (!reporting()) return;
  const now = await $.clock.now();
  if (!force && now - lastSent < GAP) {
    if (!waiting) {
      waiting = true;
      $.clock.after(GAP - (now - lastSent), async () => {
        waiting = false;
        save($, false);
      });
    }
    return;
  }
  lastSent = now;
  if (team.name && !team.user) {
    team.user = String((await $.store.get("user")) ?? "");
    if (!team.user) {
      team.user = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await $.store.set("user", team.user);
    }
  }
  const records = pending.splice(0);
  try {
    const response = team.name
      ? await $.http.fetch(`${team.server || HOSTED}/api/teams/${team.name}/usage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user: team.user, records }),
        })
      : await $.http.fetch(`${team.server}/costmaxxing/usage`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-costmaxxing-token": team.token, "x-costmaxxing-user": team.user || "unknown" },
          body: JSON.stringify({ records }),
        });
    if (response.status === 410 && team.name) {
      const moved = (JSON.parse(response.text) as { moved?: string }).moved;
      if (moved) {
        await $.store.set("team-moved", { from: team.option, to: moved });
        team.name = moved;
        pending = [...records, ...pending].slice(-5000);
        lastSent = 0;
        save($, true);
        return;
      }
    }
    totals = response.status === 404 ? "missing" : (response.ok && asTeam(response.text)) || "unreachable";
    if (response.ok && team.name) {
      const sentPricing = (JSON.parse(response.text) as { pricing?: TeamPricing | null }).pricing ?? undefined;
      if (JSON.stringify(sentPricing) !== JSON.stringify(pricing)) {
        usePricing(sentPricing);
        await $.store.set("pricing", sentPricing ?? null);
      }
    }
    if (totals === "unreachable") pending = [...records, ...pending].slice(-5000);
  } catch {
    totals = "unreachable";
    pending = [...records, ...pending].slice(-5000);
  }
  $.ui.invalidate("ui.render");
}

function save($: Mods, force: boolean): void {
  queue = queue.then(() => flush($, force)).catch(() => undefined);
}

export function register(on: On, options: Record<string, unknown>): void {
  const option = (name: string) => (typeof options[name] === "string" ? (options[name] as string).trim() : "");
  team.name = option("team").toLowerCase();
  team.option = team.name;
  team.server = option("server").replace(/\/+$/, "");
  team.token = option("token");
  team.user = option("user");

  on("session.start", async ($, e, next) => {
    await load($);
    if (reporting()) $.clock.after(0, async () => save($, true));
    return next(e);
  });

  on("session.end", async ($, e, next) => {
    if (pending.length > 0) {
      save($, true);
      await queue;
    }
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    const result = yield* next(e);
    if (!result?.usage) return result;
    const time = await $.clock.now();
    const subagent = e.agentId !== undefined;
    const record = stepRecord(result.usage, { id: `${sessionId}/${e.turnId}/${e.agentId ?? "main"}/${e.index}`, session: sessionId, subagent, time });
    const tally = priceRecord(record, book, pricing?.scenario);
    session = add(session, tally);
    month = add(month, tally);
    gain = { amount: (Date.now() < gain.until ? gain.amount : 0) + (tally.price - tally.alt), until: Date.now() + 4000 };
    $.clock.after(4100, async () => $.ui.invalidate("ui.render"));
    const key = `${localDay(time)} ${sessionId}`;
    unsaved.set(key, add(unsaved.get(key) ?? NONE, tally));
    if (reporting()) pending.push(record);
    $.ui.invalidate("ui.render");
    $.clock.after(0, async () => save($, false));
    return result;
  });

  on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
    const { Box, Text, Link } = $.ui.resolve(e);
    const theirs = await next(e);
    const parts = statusParts(session, month, totals, Date.now() < gain.until ? gain.amount : 0);
    const page = team.name ? `${team.server || HOSTED}/${team.name}` : team.server && team.token ? `${team.server}/` : "";
    const link = page
      ? [Text({ ...TONES.divider, children: [" │ "] }), Link({ href: page, children: [Text({ color: "#8d71d6", underline: true, children: ["team page ↗"] })] })]
      : [];
    const ours = Text({ wrap: "truncate-start", children: [...parts.map(([text, tone]) => Text({ ...TONES[tone], children: [text] })), ...link] });
    return Box({ flexDirection: "row", justifyContent: "space-between", columnGap: 2, children: [theirs, ours] });
  });
}
