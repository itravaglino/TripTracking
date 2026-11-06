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

test("spanish cancellation wording, english dates and offsets stay attached to the reservation", () => {
  const cancelled = parseMailboxMessage({
    messageId: "cancel-es",
    from: "Hotel Sol <reservas@hotelsol.example>",
    subject: "Cancelación de su reserva en Hotel Sol",
    text: "Le informamos de la cancelación de su estancia. Check-in: 15 de marzo de 2026. Código de reserva: SOL4412",
    html: "",
  });
  assert.equal(cancelled[0].category, "lodging");
  assert.equal(cancelled[0].status, "cancelled");
  assert.equal(cancelled[0].startsAt, "2026-03-15T03:00:00.000Z");

  const english = parseMailboxMessage({
    messageId: "en-stay",
    from: "Palma House <stay@palma.example>",
    subject: "Your stay is confirmed",
    text: "Check-in: March 15, 2026. Confirmation: HM7XK2. Hotel Palma, Madrid",
    html: "",
  });
  assert.equal(english[0].category, "lodging");
  assert.equal(english[0].confirmationCode, "HM7XK2");
  assert.equal(english[0].startsAt, "2026-03-15T03:00:00.000Z");

  const offset = parseMailboxMessage({
    messageId: "offset-flight",
    from: "United <reservas@united.example>",
    subject: "Flight confirmation",
    text: "Flight UA 123 from Miami to Madrid. Booking reference: ABCDEF. Departure 2026-06-01T14:30:00+02:00",
    html: "",
  });
  assert.equal(offset[0].category, "flight");
  assert.equal(offset[0].confirmationCode, "ABCDEF");
  assert.equal(offset[0].startsAt, "2026-06-01T12:30:00.000Z");
});

test("plain itinerary is kept when the only json-ld block has no date", () => {
  const items = parseMailboxMessage({
    messageId: "mixed",
    from: "Aerolíneas Argentinas <reservas@aerolineas.com.ar>",
    subject: "Tu reserva está confirmada",
    html: `<script type="application/ld+json">${JSON.stringify({
      "@type": "FlightReservation",
      reservationFor: { "@type": "Flight", airline: { name: "Aerolíneas" } },
    })}</script>`,
    text: `Pasajero: Ana Pérez
Vuelo AR 1130
Salida: Córdoba (COR) 4 de marzo de 2027 08:40
Llegada: Buenos Aires (AEP) 4 de marzo de 2027 10:05
Código de reserva: K7Q2PL`,
  });
  assert.equal(items[0].confirmationCode, "K7Q2PL");
  assert.equal(items[0].startsAt, "2027-03-04T11:40:00.000Z");
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
