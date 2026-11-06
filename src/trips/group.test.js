import assert from "node:assert/strict";
import test from "node:test";
import { groupReservations } from "./group.js";

test("clusters a flight and a hotel that belong to the same trip", () => {
  const groups = groupReservations([
    { id: "h", category: "lodging", title: "Hotel de Russie", destination: "Roma", start: "2026-12-03T15:00:00+01:00", end: "2026-12-08T11:00:00+01:00" },
    { id: "f", category: "flight", title: "AR1134", destination: "FCO · Fiumicino", start: "2026-12-02T22:10:00-03:00", end: "2026-12-03T15:40:00+01:00" },
    { id: "e", category: "event", title: "Show", destination: "Buenos Aires", start: "2026-03-01T21:00:00-03:00", end: "" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].title, "Buenos Aires");
  assert.equal(groups[1].items.map((item) => item.id).join(","), "f,h");
  assert.equal(groups[1].title, "Fiumicino");
});
