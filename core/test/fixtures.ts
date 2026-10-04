export const NOW = Date.parse("2026-10-01T12:00:00Z");
export const DAY = 86_400_000;

export function iso(daysAgo: number): string {
  return new Date(NOW - daysAgo * DAY).toISOString();
}

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
}

export function claudeLine(o: {
  requestId: string;
  model?: string;
  daysAgo?: number;
  sessionId?: string;
  usage?: ClaudeUsage;
  content?: string;
}): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    message: {
      model: o.model ?? "claude-opus-5-5",
      id: `msg_${o.requestId}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: o.content ?? "hello" }],
      usage: o.usage ?? { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
    requestId: o.requestId,
    type: "assistant",
    uuid: `uuid-${o.requestId}-${Math.random()}`,
    timestamp: iso(o.daysAgo ?? 1),
    sessionId: o.sessionId ?? "session-1",
  });
}

export function codexLine(type: string, payload: Record<string, unknown>, daysAgo = 1): string {
  return JSON.stringify({ timestamp: iso(daysAgo), type, payload });
}

export function codexUsage(input: number, cached: number, output: number, writes = 0) {
  return {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: writes,
    output_tokens: output,
    reasoning_output_tokens: 0,
    total_tokens: input + output,
  };
}

export function tokenCount(last: ReturnType<typeof codexUsage>, total: number, daysAgo = 1): string {
  return codexLine(
    "event_msg",
    { type: "token_count", info: { total_token_usage: { total_tokens: total }, last_token_usage: last } },
    daysAgo,
  );
}

export const MODELS_DEV = {
  anthropic: {
    models: {
      "claude-opus-5-5": { name: "Claude Opus 5.5", cost: { input: 4, output: 20, cache_read: 0.2, cache_write: 5 } },
      "claude-sonnet-5": { name: "Claude Sonnet 5", cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 } },
      "claude-haiku-4-5": { name: "Claude Haiku 4.5", cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 } },
      "claude-fable-5-1": { name: "Claude Fable 5.1", cost: { input: 10, output: 50, cache_read: 0.25, cache_write: 12.5 } },
    },
  },
  openai: {
    models: {
      "gpt-6-sol": {
        name: "GPT-6 Sol",
        cost: {
          input: 2,
          output: 10,
          cache_read: 0.2,
          cache_write: 2.5,
          tiers: [{ input: 4, output: 15, cache_read: 0.4, cache_write: 5, tier: { type: "context", size: 272000 } }],
          context_over_200k: { input: 4, output: 15, cache_read: 0.4, cache_write: 5 },
        },
      },
      "gpt-6-luna": { name: "GPT-6 Luna", cost: { input: 0.1, output: 0.5 } },
      "gpt-6-terra": { name: "GPT-6 Terra", cost: { input: 1, output: 4, cache_read: 0.1 } },
    },
  },
  togetherai: {
    models: {
      "zai-org/GLM-5.3": { name: "GLM-5.3", cost: { input: 1.4, output: 4.4, cache_read: 0.26 } },
      "zai-org/GLM-5.3-Flash": { name: "GLM-5.3 Flash", cost: { input: 0.15, output: 0.5, cache_read: 0.03 } },
      "deepseek-ai/DeepSeek-V4.1-Flash": { name: "DeepSeek V4.1 Flash", cost: { input: 0.3, output: 1.2, cache_read: 0.006 } },
    },
  },
  baseten: {
    models: {
      "zai-org/GLM-5.3": { name: "GLM-5.3", cost: { input: 1.4, output: 4.4, cache_read: 0.14 } },
      "zai-org/GLM-5.3-Flash": { name: "GLM-5.3 Flash", cost: { input: 0.15, output: 0.5 } },
    },
  },
  deepinfra: {
    models: {
      "big/model": { name: "Big", cost: { input: 1, output: 2, context_over_200k: { input: 2, output: 4 } } },
      "no/price": { name: "Free text" },
    },
  },
};

export const SPEND_CSV = [
  "user_email,account_uuid,product,model,total_requests,total_prompt_tokens,total_completion_tokens,total_net_spend_usd,total_gross_spend_usd,user_id,total_uncached_input_tokens,total_cache_read_tokens,total_cache_write_5m_tokens,total_cache_write_1h_tokens,total_web_search_count,slack_channel_id,teams_channel_id",
  "ada@example.com,a1,Claude Code,claude-opus-5-5,10,1100000,20000,0,0,u1,100000,900000,100000,0,0,,",
  'ada@example.com,a1,Chat,claude-fable-5-1,2,20000,1000,0,"1,000.50",u1,20000,0,0,0,0,,',
  "bob@example.com,b1,Claude Code,claude-haiku-4-5-20251001,4,40000,4000,0,0,u2,40000,0,0,0,0,,",
  "bob@example.com,b1,Research,mystery-model,3,3000,300,0,0,u2,3000,0,0,0,0,,",
  "cy@example.com,c1,Cowork,claude-sonnet-5,1,1000,100,0,0,u3,1000,0,0,0,0,,",
].join("\r\n");

export const MEMBERS_CSV = [
  "Name,Email,Role,Seat Tier",
  "Ada,ada@example.com,Owner,Premium",
  "Bob,bob@example.com,User,Standard",
  "Cy,cy@example.com,User,standard",
  "Di,di@example.com,User,Standard",
  "Pending,,User,Standard",
].join("\n");
