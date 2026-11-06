import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_MESSAGES } from "./demo-inbox.js";
import { findDates, parseEmail } from "./parse.js";

const flight = DEMO_MESSAGES.find((item) => item.id === "demo-flight");
const hotel = DEMO_MESSAGES.find((item) => item.id === "demo-hotel");
const car = DEMO_MESSAGES.find((item) => item.id === "demo-car");
const event = DEMO_MESSAGES.find((item) => item.id === "demo-event");
const graph = DEMO_MESSAGES.find((item) => item.id === "demo-return");
const bus = DEMO_MESSAGES.find((item) => item.id === "demo-bus");
const cancelled = DEMO_MESSAGES.find((item) => item.id === "demo-cancel");
const noise = DEMO_MESSAGES.find((item) => item.id === "demo-noise");

test("reads a schema.org flight reservation", () => {
  const [item] = parseEmail(flight);
  assert.equal(item.category, "flight");
  assert.equal(item.confirmationCode, "AR8K2P");
  assert.equal(item.detail, "AR1134");
  assert.match(item.origin, /EZE/);
  assert.match(item.destination, /FCO/);
  assert.equal(item.start, "2026-12-02T22:10:00-03:00");
  assert.equal(item.passenger, "Ada Viajera");
  assert.equal(item.status, "confirmed");
});

test("reads lodging, rental car, and event markup", () => {
  const stay = parseEmail(hotel)[0];
  assert.equal(stay.category, "lodging");
  assert.equal(stay.title, "Hotel de Russie");
  assert.equal(stay.destination, "Roma");
  assert.match(stay.location, /Via del Babuino/);
  assert.equal(stay.confirmationCode, "BK998811");

  const rental = parseEmail(car)[0];
  assert.equal(rental.category, "transport");
  assert.equal(rental.provider, "Hertz");
  assert.match(rental.origin, /FCO/);

  const ticket = parseEmail(event)[0];
  assert.equal(ticket.category, "event");
  assert.equal(ticket.title, "Roma Jazz Night");
  assert.equal(ticket.destination, "Roma");
});

test("walks @graph reservations", () => {
  const [item] = parseEmail(graph);
  assert.equal(item.category, "flight");
  assert.equal(item.detail, "AR1135");
  assert.match(item.destination, /EZE/);
});

test("reads a Spanish bus ticket and a cancelled flight from plain text", () => {
  const [ticket] = parseEmail(bus);
  assert.equal(ticket.category, "transport");
  assert.equal(ticket.confirmationCode, "BUS441");
  assert.equal(ticket.start, "2026-11-20");

  const [flightItem] = parseEmail(cancelled);
  assert.equal(flightItem.category, "flight");
  assert.equal(flightItem.status, "cancelled");
  assert.equal(flightItem.detail, "LA123");
  assert.equal(flightItem.origin, "EZE");
  assert.equal(flightItem.destination, "SCL");
  assert.equal(flightItem.start, "2026-01-15");
});

test("ignores a fare advertisement that is not a reservation", () => {
  assert.deepEqual(parseEmail(noise), []);
});

test("parses written Spanish dates", () => {
  assert.deepEqual(findDates("salida 2 de diciembre de 2026"), ["2026-12-02"]);
});
