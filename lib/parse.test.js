import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CATEGORIES } from "./categories.js";
import { findDates, formatWhen, groupTrips, parseMessages, parseReservation } from "./parse.js";
import { SAMPLE_MESSAGES } from "./samples.js";

test("reads dates in Spanish, English, and day-first numbers", () => {
  assert.deepEqual(findDates("Salida: Córdoba (COR) 15 mar 2026 08:40"), ["2026-03-15T08:40"]);
  assert.deepEqual(findDates("Fecha: 4 de abril de 2026, 21:00"), ["2026-04-04T21:00"]);
  assert.deepEqual(findDates("Check-in: Fri, Apr 3, 2026\nCheckout: Mon, Apr 6, 2026"), ["2026-04-03", "2026-04-06"]);
  assert.deepEqual(findDates("20/05/2026 23:00 y 21/05/2026 07:30"), ["2026-05-20T23:00", "2026-05-21T07:30"]);
});

test("classifies the sample mailbox and drops billing mail", () => {
  const parsed = parseMessages(SAMPLE_MESSAGES);
  const byId = Object.fromEntries(parsed.map((item) => [item.messageId, item]));
  assert.equal(byId["sample-noise"], undefined);
  assert.equal(byId["sample-flight"].category, "flight");
  assert.equal(byId["sample-flight"].confirmationCode, "ABC123");
  assert.equal(byId["sample-flight"].startsAt, "2026-03-15T08:40");
  assert.match(byId["sample-flight"].origin, /COR/);
  assert.match(byId["sample-flight"].destination, /AEP/);
  assert.equal(byId["sample-lodging"].category, "lodging");
  assert.equal(byId["sample-lodging"].startsAt, "2026-04-03");
  assert.equal(byId["sample-lodging"].endsAt, "2026-04-06");
  assert.equal(byId["sample-lodging"].currency, "USD");
  assert.equal(byId["sample-transport"].category, "transport");
  assert.match(byId["sample-transport"].origin, /Córdoba/);
  assert.match(byId["sample-transport"].destination, /Mendoza/);
  assert.equal(byId["sample-plan"].category, "plan");
  assert.equal(byId["sample-plan"].party, "2");
  assert.equal(byId["sample-event"].category, "event");
  assert.equal(byId["sample-event"].currency, "ARS");
});

test("a profile can keep trips and lodging and skip events", () => {
  const categories = { ...DEFAULT_CATEGORIES, event: false };
  const parsed = parseMessages(SAMPLE_MESSAGES, categories);
  assert.equal(parsed.some((item) => item.category === "event"), false);
  assert.equal(parsed.some((item) => item.category === "flight"), true);
  assert.equal(parsed.some((item) => item.category === "lodging"), true);
});

test("groups a flight, stay, and dinner in the same city into one trip", () => {
  const stay = parseReservation({
    id: "stay",
    subject: "Hotel Austral",
    body: "Hotel Austral\nCheck-in: 3 de abril de 2026\nCheck-out: 6 de abril de 2026\nDirección: Palermo, Buenos Aires\nCódigo de reserva: HTL1234",
  });
  const flight = parseReservation(SAMPLE_MESSAGES[0]);
  const dinner = parseReservation(SAMPLE_MESSAGES[3]);
  assert.equal(stay.category, "lodging");
  const trips = groupTrips([flight, stay, dinner], "es");
  const together = trips.find((trip) => trip.items.some((item) => item.messageId === "sample-plan"));
  assert.ok(together);
  assert.equal(together.items.some((item) => item.messageId === "stay"), true);
  assert.equal(formatWhen("2026-04-04T21:00", "es"), "4 abr 2026 21:00");
});
