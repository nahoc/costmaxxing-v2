import { num, obj, parseObject, str, type Json } from "./json.ts";
import type { RequestRecord, Tokens } from "./types.ts";

export function claudeCodeParser(): (line: string, subagent: boolean) => RequestRecord | undefined {
  const seen = new Set<string>();
  return (line, subagent) => {
    if (!line.includes('"usage"')) return undefined;
    const at = line.indexOf('"requestId":"');
    if (at >= 0 && seen.has(line.slice(at + 13, line.indexOf('"', at + 13)))) return undefined;
    const o = parseObject(line);
    if (o?.type !== "assistant") return undefined;
    const message = obj(o.message);
    const usage = obj(message?.usage);
    const id = str(o.requestId);
    const session = str(o.sessionId);
    const model = str(message?.model);
    const time = Date.parse(str(o.timestamp) ?? "");
    if (!usage || !id || !session || !model || model === "<synthetic>" || Number.isNaN(time)) return undefined;
    seen.add(id);
    const writes = num(usage.cache_creation_input_tokens);
    const write1h = Math.min(writes, num(obj(usage.cache_creation)?.ephemeral_1h_input_tokens));
    return {
      id,
      harness: "Claude Code",
      model,
      time,
      session,
      subagent,
      tokens: {
        uncached: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        write5m: writes - write1h,
        write1h,
      },
    };
  };
}

function codexTokens(usage: Json): Tokens {
  const cached = num(usage.cached_input_tokens);
  const writes = num(usage.cache_write_input_tokens);
  return {
    uncached: Math.max(0, num(usage.input_tokens) - cached - writes),
    output: num(usage.output_tokens),
    cacheRead: cached,
    write5m: writes,
    write1h: 0,
  };
}

const CODEX_TYPES = ['"token_usage_record"', '"turn_context"', '"session_meta"', '"token_count"'];

export function parseCodexLines(lines: Iterable<string>): RequestRecord[] {
  let session = "";
  let model = "unknown";
  let lastTotal = 0;
  const records: RequestRecord[] = [];
  for (const line of lines) {
    if (!CODEX_TYPES.some((type) => line.includes(type))) continue;
    const o = parseObject(line);
    const payload = obj(o?.payload);
    if (!o || !payload) continue;
    const time = Date.parse(str(o.timestamp) ?? "");
    if (o.type === "session_meta") {
      session = str(payload.id) ?? session;
    } else if (o.type === "turn_context") {
      model = str(payload.model) ?? model;
    } else if (o.type === "token_usage_record") {
      const usage = obj(payload.usage);
      const id = str(payload.response_id);
      if (!usage || !id || Number.isNaN(time)) continue;
      lastTotal = Number.POSITIVE_INFINITY;
      records.push({
        id,
        harness: "Codex",
        model: str(payload.model) ?? model,
        time,
        session: str(payload.session_id) ?? session,
        subagent: false,
        tokens: codexTokens(usage),
      });
    } else if (o.type === "event_msg" && payload.type === "token_count") {
      const info = obj(payload.info);
      const usage = obj(info?.last_token_usage);
      const total = num(obj(info?.total_token_usage)?.total_tokens);
      if (!usage || total <= lastTotal || Number.isNaN(time)) continue;
      lastTotal = total;
      records.push({
        id: `${session}:${total}`,
        harness: "Codex",
        model,
        time,
        session,
        subagent: false,
        tokens: codexTokens(usage),
      });
    }
  }
  return records;
}
