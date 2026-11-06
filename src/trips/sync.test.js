import assert from "node:assert/strict";
import test from "node:test";
import { readMailbox } from "./sync.js";
import { DEMO_MESSAGES } from "./demo-inbox.js";

test("demo inbox respects the categories chosen at setup", async () => {
  const found = await readMailbox({
    profile: { categories: { flight: true, lodging: false, transport: false, event: true } },
    messages: DEMO_MESSAGES,
  });
  assert.ok(found.some((item) => item.category === "flight"));
  assert.ok(found.some((item) => item.category === "event"));
  assert.equal(found.some((item) => item.sourceMessageId === "demo-noise"), false);
});
