import { num, obj, str, type Json } from "./json.ts";
import type { Tokens } from "./types.ts";

export interface WireUsage {
  id?: string;
  model: string;
  tokens: Tokens;
}

const FINAL_OPENAI = new Set(["response.completed", "response.incomplete", "response.failed", "response.done"]);

function anthropicTokens(usage: Json, into: Partial<Tokens>): Partial<Tokens> {
  const t = { ...into };
  if (typeof usage.input_tokens === "number") t.uncached = num(usage.input_tokens);
  if (typeof usage.output_tokens === "number") t.output = num(usage.output_tokens);
  if (typeof usage.cache_read_input_tokens === "number") t.cacheRead = num(usage.cache_read_input_tokens);
  if (typeof usage.cache_creation_input_tokens === "number") {
    const writes = num(usage.cache_creation_input_tokens);
    const split = obj(usage.cache_creation);
    t.write1h = Math.min(writes, split ? num(split.ephemeral_1h_input_tokens) : (t.write1h ?? 0));
    t.write5m = writes - t.write1h;
  }
  return t;
}

function openaiTokens(usage: Json): Tokens {
  const chat = "prompt_tokens" in usage;
  const input = num(chat ? usage.prompt_tokens : usage.input_tokens);
  const cached = num(obj(chat ? usage.prompt_tokens_details : usage.input_tokens_details)?.cached_tokens);
  return {
    uncached: Math.max(0, input - cached),
    output: num(chat ? usage.completion_tokens : usage.output_tokens),
    cacheRead: cached,
    write5m: 0,
    write1h: 0,
  };
}

export function wireMeter() {
  let model = "";
  let id: string | undefined;
  let partial: Partial<Tokens> = {};
  let final: Tokens | undefined;
  let terminal = false;
  return {
    event(value: unknown): void {
      const o = obj(value);
      if (!o) return;
      const message = o.type === "message_start" ? obj(o.message) : o.type === "message" ? o : undefined;
      if (message) {
        model = str(message.model) ?? model;
        id = str(message.id) ?? id;
        partial = anthropicTokens(obj(message.usage) ?? {}, partial);
      }
      if (o.type === "message_delta") partial = anthropicTokens(obj(o.usage) ?? {}, partial);
      if (o.type === "message_stop" || (o.type === "message" && obj(o.usage))) {
        final = { uncached: 0, output: 0, cacheRead: 0, write5m: 0, write1h: 0, ...partial };
        terminal = true;
      }
      const response = typeof o.type === "string" && FINAL_OPENAI.has(o.type) ? obj(o.response) : o.object === "response" ? o : undefined;
      const chat = o.object === "chat.completion" || o.object === "chat.completion.chunk" ? o : undefined;
      const done = response ?? chat;
      const usage = obj(done?.usage);
      if (done && usage) {
        model = str(done.model) ?? model;
        id = str(done.id) ?? id;
        final = openaiTokens(usage);
        terminal = o.object !== "chat.completion.chunk";
      }
    },
    terminal(): boolean {
      return terminal;
    },
    result(): WireUsage | undefined {
      return final && model ? { id, model, tokens: final } : undefined;
    },
  };
}

export function sseData(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data.startsWith("{")) continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      continue;
    }
  }
  return { events, rest };
}
