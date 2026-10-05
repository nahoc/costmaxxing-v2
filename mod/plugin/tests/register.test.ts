import { expect, mock, test } from "claude-code/testing";

const HINT = {
  plugin: "costmaxxing",
  component: "PromptHint",
  requestId: "hint",
  viewport: { columns: 200, rows: 40 },
  props: { isDraft: false, isWorking: false, hint: "? for shortcuts" },
} as const;

const USAGE = { model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 4000 };

test("each request adds its open-weight savings to the hint line, and the day is saved for later sessions", async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 9, 5, 12).getTime() });
  const saved = new Map<string, unknown>([
    ["2026-09-20 earlier", { requests: 3, price: 10, alt: 1 }],
    ["2026-08-01 stale", { requests: 1, price: 5, alt: 1 }],
    ["unrelated", 7],
  ]);
  on("store.get", ($, e) => ({ value: saved.get(e.key) }));
  on("store.set", ($, e) => {
    saved.set(e.key, e.value);
    return { value: undefined };
  });
  on("store.delete", ($, e) => {
    saved.delete(e.key);
    return { value: undefined };
  });
  on("store.keys", () => ({ value: [...saved.keys()] }));
  on("session.id", () => ({ value: "s1" }));
  on("session.start", () => ({ cwd: "/work" }));
  on("turn.step", async function* ($, e) {
    yield { kind: "text", index: 0, text: "ok" };
    return { turnId: e.turnId, index: e.index, answer: "ok", toolUses: [], stopReason: "end_turn", usage: USAGE };
  });
  on("ui.render", { component: "PromptHint" }, ($, e) => ({ type: "Text", props: {}, children: [e.props.hint] }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const stream = $.turn.step({ turnId: "t1", index: 0, model: "claude-opus-5-5", messageCount: 1 });
  let step = await stream.next();
  while (step.done !== true) step = await stream.next();
  expect(step.value.usage).toEqual(USAGE);
  for (let i = 0; i < 5; i++) await clock.settle();

  const ui = await $.ui.mount({ ...HINT, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "? for shortcuts" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "costmaxxing" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "  Potential savings via open-weight: " })).toBeDefined();
  const amounts = await ui.findAll({ type: "Text", text: /^\$[\d.]+$/ });
  const [sessionSavings, monthSavings] = amounts.map((el) => Number(String(el.children[0]).slice(1)));
  expect((sessionSavings ?? 0) > 0).toBe(true);
  expect(((monthSavings ?? 0) - (sessionSavings ?? 0)).toFixed(2)).toBe("9.00");
  expect(await ui.find({ type: "Text", text: /^ ▲ \+\$[\d.]+$/ })).toBeDefined();
  expect(saved.get("2026-10-05 s1")).toMatchObject({ requests: 1 });
  expect(saved.has("2026-08-01 stale")).toBe(false);
  expect(saved.get("unrelated")).toBe(7);
});
