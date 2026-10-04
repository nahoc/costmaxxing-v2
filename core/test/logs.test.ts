import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeCodeParser, parseCodexLines, type RequestRecord } from "../src/index.ts";
import { claudeLine, codexLine, codexUsage, NOW, tokenCount } from "./fixtures.ts";

function parseAll(lines: [string, boolean][]): RequestRecord[] {
  const parse = claudeCodeParser();
  return lines.flatMap(([line, subagent]) => parse(line, subagent) ?? []);
}

test("Claude Code: one record per requestId across content-block lines and files", () => {
  const records = parseAll([
    [claudeLine({ requestId: "req_1", content: "thinking" }), false],
    [claudeLine({ requestId: "req_1", content: "tool_use" }), false],
    [claudeLine({ requestId: "req_2" }), false],
    [claudeLine({ requestId: "req_1", sessionId: "resumed-copy" }), false],
  ]);
  assert.deepEqual(
    records.map((r) => r.id),
    ["req_1", "req_2"],
  );
});

test("Claude Code: a requestId quoted inside content does not hide a new request", () => {
  const records = parseAll([
    [claudeLine({ requestId: "req_1" }), false],
    [claudeLine({ requestId: "req_2", content: '{"requestId":"req_1"}' }), false],
  ]);
  assert.deepEqual(
    records.map((r) => r.id),
    ["req_1", "req_2"],
  );
});

test("Claude Code: subagent files flag their requests", () => {
  const records = parseAll([
    [claudeLine({ requestId: "req_main" }), false],
    [claudeLine({ requestId: "req_sub" }), true],
  ]);
  assert.deepEqual(
    records.map((r) => [r.id, r.subagent]),
    [
      ["req_main", false],
      ["req_sub", true],
    ],
  );
});

test("Claude Code: skips <synthetic>, other line types, and lines without usage", () => {
  const user = JSON.stringify({ type: "user", requestId: "req_u", message: { usage: {} }, sessionId: "s", timestamp: "2026-01-01T00:00:00Z" });
  const noUsage = JSON.stringify({ type: "assistant", requestId: "req_n", message: { model: "claude-opus-5-5" } });
  const records = parseAll([
    [claudeLine({ requestId: "req_s", model: "<synthetic>" }), false],
    [user, false],
    [noUsage, false],
    ["not json \"usage\"", false],
  ]);
  assert.deepEqual(records, []);
});

test("Claude Code: maps usage and splits cache writes into 5m and 1h", () => {
  const [split, unsplit] = parseAll([
    [
      claudeLine({
        requestId: "req_a",
        model: "claude-opus-5-5[1m]",
        usage: {
          input_tokens: 7,
          output_tokens: 11,
          cache_read_input_tokens: 13,
          cache_creation_input_tokens: 300,
          cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 },
        },
      }),
      false,
    ],
    [claudeLine({ requestId: "req_b", usage: { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 50 } }), false],
  ]);
  assert.equal(split?.model, "claude-opus-5-5[1m]");
  assert.deepEqual(split?.tokens, { uncached: 7, output: 11, cacheRead: 13, write5m: 200, write1h: 100 });
  assert.deepEqual(unsplit?.tokens, { uncached: 1, output: 2, cacheRead: 0, write5m: 50, write1h: 0 });
  assert.equal(split?.harness, "Claude Code");
  assert.equal(split?.session, "session-1");
  assert.ok(Math.abs((split?.time ?? 0) - (NOW - 86_400_000)) < 1);
});

test("Codex: token_usage_record per response, model from turn_context, token_count ignored", () => {
  const records = parseCodexLines([
    codexLine("session_meta", { id: "thread-1", base_instructions: "…" }),
    codexLine("turn_context", { model: "gpt-6-sol" }),
    codexLine("token_usage_record", { response_id: "resp_1", session_id: "root-1", usage: codexUsage(1000, 600, 50, 100) }),
    tokenCount(codexUsage(1000, 600, 50, 100), 1050),
    codexLine("turn_context", { model: "gpt-6-luna" }),
    codexLine("token_usage_record", { response_id: "resp_2", session_id: "root-1", model: "gpt-6-terra", usage: codexUsage(10, 0, 5) }),
    codexLine("token_usage_record", { response_id: "resp_3", session_id: "root-1", usage: codexUsage(10, 0, 5) }),
    tokenCount(codexUsage(10, 0, 5), 2000),
  ]);
  assert.deepEqual(
    records.map((r) => [r.id, r.model, r.session]),
    [
      ["resp_1", "gpt-6-sol", "root-1"],
      ["resp_2", "gpt-6-terra", "root-1"],
      ["resp_3", "gpt-6-luna", "root-1"],
    ],
  );
  assert.deepEqual(records[0]?.tokens, { uncached: 300, output: 50, cacheRead: 600, write5m: 100, write1h: 0 });
});

test("Codex: older files fall back to token_count and skip totals that don't go up", () => {
  const records = parseCodexLines([
    codexLine("session_meta", { id: "old-session" }),
    codexLine("turn_context", { model: "gpt-5.6-sol" }),
    tokenCount(codexUsage(100, 40, 10), 110),
    tokenCount(codexUsage(100, 40, 10), 110),
    tokenCount(codexUsage(200, 150, 20), 330),
    codexLine("event_msg", { type: "agent_message", message: "token_count" }),
  ]);
  assert.deepEqual(
    records.map((r) => [r.id, r.model, r.session, r.tokens.uncached, r.tokens.cacheRead, r.tokens.output]),
    [
      ["old-session:110", "gpt-5.6-sol", "old-session", 60, 40, 10],
      ["old-session:330", "gpt-5.6-sol", "old-session", 50, 150, 20],
    ],
  );
});

test("Codex: a session resumed in a newer version keeps its earlier token_count turns", () => {
  const records = parseCodexLines([
    codexLine("session_meta", { id: "s" }),
    codexLine("turn_context", { model: "gpt-6-sol" }),
    tokenCount(codexUsage(100, 0, 10), 110),
    codexLine("token_usage_record", { response_id: "resp_9", session_id: "s", usage: codexUsage(50, 0, 5) }),
    tokenCount(codexUsage(50, 0, 5), 165),
  ]);
  assert.deepEqual(
    records.map((r) => r.id),
    ["s:110", "resp_9"],
  );
});
