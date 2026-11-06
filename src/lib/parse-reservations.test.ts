import assert from "node:assert/strict";
import test from "node:test";
import { gmailQuery } from "./gmail";
import { parseReservationEmail } from "./parse-reservations";

const flightHtml = `
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "FlightReservation",
  "reservationNumber": "RXJ34C",
  "reservationStatus": "http://schema.org/Confirmed",
  "underName": { "@type": "Person", "name": "Eva Green" },
  "reservationFor": {
    "@type": "Flight",
    "flightNumber": "110",
    "airline": { "@type": "Airline", "name": "United", "iataCode": "UA" },
    "departureAirport": { "@type": "Airport", "name": "San Francisco Airport", "iataCode": "SFO" },
    "arrivalAirport": { "@type": "Airport", "name": "John F. Kennedy International Airport", "iataCode": "JFK" },
    "departureTime": "2026-12-04T11:15:00-08:00",
    "arrivalTime": "2026-12-04T19:45:00-05:00"
  }
}
</script>`;

test("reads a schema.org flight reservation", () => {
  const [flight] = parseReservationEmail({ html: flightHtml });
  assert.equal(flight.category, "flight");
  assert.equal(flight.confirmationCode, "RXJ34C");
  assert.equal(flight.provider, "United");
  assert.match(flight.origin ?? "", /SFO/);
  assert.match(flight.destination ?? "", /JFK/);
  assert.equal(flight.startsAt, "2026-12-04T11:15:00-08:00");
  assert.equal(flight.details.passenger, "Eva Green");
  assert.equal(flight.details.flightNumber, "UA110");
});

test("reads lodging and skips a newsletter", () => {
  const hotel = parseReservationEmail({
    html: `<script type="application/ld+json">{
      "@type": "LodgingReservation",
      "reservationNumber": "AB123",
      "reservationStatus": "http://schema.org/Cancelled",
      "checkinTime": "2026-04-11T16:00:00-03:00",
      "checkoutTime": "2026-04-13T11:00:00-03:00",
      "reservationFor": {
        "@type": "LodgingBusiness",
        "name": "Hotel de la Plaza",
        "address": { "@type": "PostalAddress", "addressLocality": "Córdoba", "addressCountry": "AR" }
      }
    }</script>`,
  });
  assert.equal(hotel[0].category, "lodging");
  assert.equal(hotel[0].status, "cancelled");
  assert.match(hotel[0].location ?? "", /Córdoba/);

  const noise = parseReservationEmail({
    subject: "10% off our next event",
    text: "Join the newsletter. No reservation is attached.",
  });
  assert.equal(noise.length, 0);
});

test("reads a Spanish confirmation and an ics transfer", () => {
  const [plain] = parseReservationEmail({
    subject: "Confirmación de vuelo COR → EZE",
    text: "Tu reserva está confirmada. Localizador: QW12ER. Salida 4 de diciembre de 2026 a las 08:40.",
  });
  assert.equal(plain.category, "flight");
  assert.equal(plain.confirmationCode, "QW12ER");
  assert.equal(plain.startsAt, "2026-12-04T08:40:00");
  assert.equal(plain.origin, "COR");
  assert.equal(plain.destination, "EZE");

  const [ride] = parseReservationEmail({
    ics: `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Reserva de transfer al aeropuerto
DTSTART:20261204T120000Z
DTEND:20261204T124000Z
LOCATION:Córdoba
UID:transfer-1@example.com
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`,
  });
  assert.equal(ride.category, "transport");
  assert.equal(ride.startsAt, "2026-12-04T12:00:00Z");
});

test("gmail query stays inside the chosen categories", () => {
  const query = gmailQuery(["lodging"], 30);
  assert.match(query, /newer_than:30d/);
  assert.match(query, /hotel/);
  assert.doesNotMatch(query, /vuelo/);
});
