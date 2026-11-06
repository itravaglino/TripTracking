import assert from "node:assert/strict";
import test from "node:test";
import {
  filterByTrack,
  groupReservations,
  normalizeSettings,
  parseMailboxMessage,
  sampleReservations,
} from "../public/trips/engine.js";

test("json-ld flight, hotel, train, tour and event stay in their categories", () => {
  const items = sampleReservations();
  const byCode = Object.fromEntries(items.map((item) => [item.confirmationCode, item]));
  assert.equal(byCode.QW8M2K.category, "flight");
  assert.equal(byCode.QW8M2K.origin.includes("EZE"), true);
  assert.equal(byCode.QW8M2K.destination.includes("MAD"), true);
  assert.equal(byCode.QW8M2K.flightNumber, "LA 8045");
  assert.equal(byCode.BK44190.category, "lodging");
  assert.equal(byCode.BK44190.title, "Hotel Prado Norte");
  assert.equal(byCode.RN22018.category, "transport");
  assert.equal(byCode.CV7781.category, "plan");
  assert.equal(byCode.TM55021.category, "event");
});

test("plain-text airline mail and a cancellation are read without json-ld", () => {
  const items = sampleReservations();
  const flight = items.find((item) => item.confirmationCode === "K7Q2PL");
  const cancelled = items.find((item) => item.confirmationCode === "HTL9912");
  assert.equal(flight.category, "flight");
  assert.equal(flight.origin.includes("Córdoba"), true);
  assert.equal(flight.destination.includes("Buenos Aires"), true);
  assert.equal(flight.party, "Ana Pérez");
  assert.equal(cancelled.category, "lodging");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.title.includes("Hotel Austral"), true);
});

test("profile defaults track trips and lodging, not events, and only known intervals", () => {
  const settings = normalizeSettings({});
  assert.deepEqual(settings.track, {
    flight: true,
    lodging: true,
    transport: true,
    plan: true,
    event: false,
  });
  assert.equal(settings.scanIntervalMinutes, 360);
  const custom = normalizeSettings({
    track: { flight: true, lodging: true, transport: false, plan: false, event: false },
    scanIntervalMinutes: 15,
  });
  assert.equal(custom.track.transport, false);
  assert.equal(custom.scanIntervalMinutes, 15);
  assert.equal(normalizeSettings({ scanIntervalMinutes: 7 }).scanIntervalMinutes, 360);
  const kept = filterByTrack(sampleReservations(), custom.track);
  assert.equal(kept.some((item) => item.category === "event"), false);
  assert.equal(kept.some((item) => item.category === "transport"), false);
  assert.equal(kept.some((item) => item.category === "flight"), true);
});

test("reservations a few days apart in the same city form one trip", () => {
  const trips = groupReservations(filterByTrack(sampleReservations(), normalizeSettings({}).track));
  assert.equal(trips.length, 2);
  assert.equal(trips[0].title, "Madrid");
  assert.equal(trips[0].items.some((item) => item.confirmationCode === "TM55021"), false);
  assert.equal(trips[1].title.includes("Buenos Aires") || trips[1].items.some((item) => item.confirmationCode === "K7Q2PL"), true);
});

test("a message without reservation signals is ignored", () => {
  const items = parseMailboxMessage({
    messageId: "newsletter",
    from: "News <news@example.com>",
    subject: "Ofertas de la semana",
    text: "Mirá estos descuentos en electrónica.",
    html: "",
  });
  assert.deepEqual(items, []);
});
