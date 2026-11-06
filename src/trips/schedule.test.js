import assert from "node:assert/strict";
import test from "node:test";
import { clampInterval, isDue, msUntilNext } from "./schedule.js";

test("a profile with no previous read is due immediately", () => {
  assert.equal(isDue("", 60, Date.parse("2026-11-06T12:00:00Z")), true);
});

test("respects a per-person interval", () => {
  const last = "2026-11-06T12:00:00Z";
  const now = Date.parse("2026-11-06T12:40:00Z");
  assert.equal(isDue(last, 60, now), false);
  assert.equal(isDue(last, 30, now), true);
  assert.equal(msUntilNext(last, 60, now), 20 * 60 * 1000);
});

test("clamps custom intervals", () => {
  assert.equal(clampInterval(1), 5);
  assert.equal(clampInterval(90.2), 90);
  assert.equal(clampInterval(999999), 7 * 24 * 60);
});
