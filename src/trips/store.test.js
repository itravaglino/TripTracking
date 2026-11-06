import assert from "node:assert/strict";
import test from "node:test";
import { parseEmail } from "./parse.js";
import { createProfile, emptyState, loadState, saveState, upsertReservations, visibleReservations } from "./store.js";
import { DEMO_MESSAGES } from "./demo-inbox.js";

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test("keeps reservations for the categories that profile asked to track", () => {
  const profile = createProfile({
    id: "ada",
    name: "Ada",
    categories: { flight: true, lodging: true, transport: false, event: false },
  });
  let state = { ...emptyState(), profiles: [profile], activeProfileId: profile.id };
  const parsed = DEMO_MESSAGES.flatMap((message) => parseEmail(message));
  state = upsertReservations(state, profile.id, parsed);
  const visible = visibleReservations(state, profile.id);
  assert.ok(visible.some((item) => item.category === "flight"));
  assert.ok(visible.some((item) => item.category === "lodging"));
  assert.equal(visible.some((item) => item.category === "transport"), false);
  assert.equal(visible.some((item) => item.category === "event"), false);
});

test("round-trips profiles without keeping access tokens", () => {
  const storage = memory();
  const profile = createProfile({ id: "ada", name: "Ada", intervalMinutes: 15, email: "ada@gmail.com" });
  saveState(storage, { ...emptyState(), profiles: [profile], activeProfileId: "ada", reservations: [] });
  const loaded = loadState(storage);
  assert.equal(loaded.profiles[0].name, "Ada");
  assert.equal(loaded.profiles[0].intervalMinutes, 15);
  assert.equal(JSON.stringify(loaded).includes("accessToken"), false);
});
