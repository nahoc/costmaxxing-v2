import assert from "node:assert/strict";
import { test } from "node:test";
import { sseData, wireMeter } from "../src/index.ts";

function feed(events: unknown[]) {
  const meter = wireMeter();
  for (const event of events) meter.event(event);
  return meter.result();
}

test("Anthropic stream: message_delta keeps the 1-hour split from message_start", () => {
  const usage = feed([
    {
      type: "message_start",
      message: {
        id: "msg_1",
        model: "claude-haiku-4-5-20251001",
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 33777,
          cache_read_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 33777 },
          output_tokens: 4,
        },
      },
    },
    { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } },
    {
      type: "message_delta",
      usage: { input_tokens: 10, cache_creation_input_tokens: 33777, cache_read_input_tokens: 0, output_tokens: 43 },
    },
    { type: "message_stop" },
  ]);
  assert.deepEqual(usage, {
    id: "msg_1",
    model: "claude-haiku-4-5-20251001",
    tokens: { uncached: 10, output: 43, cacheRead: 0, write5m: 0, write1h: 33777 },
  });
});

test("Anthropic stream without message_stop is not recorded", () => {
  assert.equal(
    feed([{ type: "message_start", message: { id: "m", model: "claude-opus-5-5", usage: { input_tokens: 5, output_tokens: 1 } } }]),
    undefined,
  );
});

test("Anthropic JSON body and count_tokens", () => {
  assert.deepEqual(
    feed([{ type: "message", id: "m", model: "claude-opus-5-5", usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 3 } }])?.tokens,
    { uncached: 5, output: 7, cacheRead: 3, write5m: 0, write1h: 0 },
  );
  assert.equal(feed([{ input_tokens: 1234 }]), undefined);
});

test("OpenAI Responses stream records the completed response", () => {
  const usage = feed([
    { type: "response.created", response: { id: "resp_1", model: "gpt-6-sol", usage: null } },
    { type: "response.output_text.delta", delta: "ok" },
    {
      type: "response.completed",
      response: {
        id: "resp_1",
        model: "gpt-6-sol",
        usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 50, output_tokens_details: { reasoning_tokens: 30 } },
      },
    },
  ]);
  assert.deepEqual(usage, { id: "resp_1", model: "gpt-6-sol", tokens: { uncached: 200, output: 50, cacheRead: 800, write5m: 0, write1h: 0 } });
});

test("OpenAI JSON bodies: responses and chat completions", () => {
  assert.equal(feed([{ object: "response", id: "r", model: "gpt-6-luna", usage: { input_tokens: 3, output_tokens: 4 } }])?.tokens.output, 4);
  assert.deepEqual(
    feed([{ object: "chat.completion", id: "c", model: "glm", usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 4 } } }])?.tokens,
    { uncached: 6, output: 2, cacheRead: 4, write5m: 0, write1h: 0 },
  );
});

test("sseData: events split across chunks, CRLF, and non-JSON data", () => {
  const first = sseData('event: response.completed\r\ndata: {"a":1}\r\ndata: [DONE]\ndata: {"b"');
  assert.deepEqual(first.events, [{ a: 1 }]);
  const second = sseData(`${first.rest}:2}\n\n`);
  assert.deepEqual(second.events, [{ b: 2 }]);
  assert.equal(second.rest, "");
});

test("null usage fields in message_delta keep the counts from message_start", () => {
  const usage = feed([
    {
      type: "message_start",
      message: { id: "m", model: "claude-opus-5-5", usage: { input_tokens: 10, cache_read_input_tokens: 5000, cache_creation_input_tokens: 300, output_tokens: 1 } },
    },
    { type: "message_delta", usage: { input_tokens: null, cache_read_input_tokens: null, cache_creation_input_tokens: null, output_tokens: 9 } },
    { type: "message_stop" },
  ]);
  assert.deepEqual(usage?.tokens, { uncached: 10, output: 9, cacheRead: 5000, write5m: 300, write1h: 0 });
});

test("chat completion chunks are not final until the stream ends", () => {
  const meter = wireMeter();
  meter.event({ object: "chat.completion.chunk", id: "c", model: "glm", usage: { prompt_tokens: 10, completion_tokens: 1 } });
  assert.equal(meter.terminal(), false);
  meter.event({ object: "chat.completion.chunk", id: "c", model: "glm", usage: { prompt_tokens: 10, completion_tokens: 50 } });
  assert.equal(meter.result()?.tokens.output, 50);
  meter.event({ type: "response.completed", response: { id: "r", model: "gpt-6-sol", usage: { input_tokens: 1, output_tokens: 1 } } });
  assert.equal(meter.terminal(), true);
});
