/** Sample confirmations so the dashboard works before a Google client id is configured. */

export const DEMO_MESSAGES = [
  {
    id: "demo-flight",
    subject: "Tu reserva AR1134 está confirmada",
    from: "Aerolíneas Argentinas <reservas@aerolineas.com.ar>",
    html: `<html><body>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "FlightReservation",
        "reservationNumber": "AR8K2P",
        "reservationStatus": "https://schema.org/Confirmed",
        "underName": { "@type": "Person", "name": "Ada Viajera" },
        "reservationFor": {
          "@type": "Flight",
          "flightNumber": "AR1134",
          "airline": { "@type": "Airline", "name": "Aerolíneas Argentinas", "iataCode": "AR" },
          "departureAirport": { "@type": "Airport", "name": "Ezeiza", "iataCode": "EZE" },
          "arrivalAirport": { "@type": "Airport", "name": "Fiumicino", "iataCode": "FCO" },
          "departureTime": "2026-12-02T22:10:00-03:00",
          "arrivalTime": "2026-12-03T15:40:00+01:00"
        }
      }
      </script>
      <p>Vuelo AR1134 EZE a FCO. Código de reserva AR8K2P.</p>
    </body></html>`,
  },
  {
    id: "demo-return",
    subject: "Itinerary AR1135",
    from: "Aerolíneas Argentinas <reservas@aerolineas.com.ar>",
    html: `<html><body>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "FlightReservation",
            "reservationNumber": "AR8K2P",
            "reservationFor": {
              "@type": "Flight",
              "flightNumber": "AR1135",
              "airline": { "name": "Aerolíneas Argentinas" },
              "departureAirport": { "iataCode": "FCO", "name": "Fiumicino" },
              "arrivalAirport": { "iataCode": "EZE", "name": "Ezeiza" },
              "departureTime": "2026-12-09T10:05:00+01:00",
              "arrivalTime": "2026-12-09T19:30:00-03:00"
            }
          }
        ]
      }
      </script>
    </body></html>`,
  },
  {
    id: "demo-hotel",
    subject: "Booking confirmed",
    from: "Booking.com <noreply@booking.com>",
    html: `<html><body>
      <script type="application/ld+json">
      {
        "@type": "LodgingReservation",
        "reservationNumber": "BK998811",
        "reservationStatus": "Confirmed",
        "checkinTime": "2026-12-03T15:00:00+01:00",
        "checkoutTime": "2026-12-08T11:00:00+01:00",
        "underName": { "name": "Ada Viajera" },
        "reservationFor": {
          "@type": "LodgingBusiness",
          "name": "Hotel de Russie",
          "address": { "streetAddress": "Via del Babuino 9", "addressLocality": "Roma", "addressCountry": "IT" }
        }
      }
      </script>
    </body></html>`,
  },
  {
    id: "demo-car",
    subject: "Hertz reservation",
    from: "Hertz <receipts@hertz.com>",
    html: `<html><body>
      <script type="application/ld+json">
      {
        "@type": "RentalCarReservation",
        "reservationNumber": "HZ44120",
        "pickupTime": "2026-12-03T16:30:00+01:00",
        "dropoffTime": "2026-12-08T09:00:00+01:00",
        "reservationFor": { "@type": "RentalCar", "name": "Fiat 500" },
        "provider": { "name": "Hertz" },
        "pickupLocation": { "name": "FCO Airport" },
        "dropoffLocation": { "name": "FCO Airport" }
      }
      </script>
    </body></html>`,
  },
  {
    id: "demo-event",
    subject: "Your tickets",
    from: "Eventbrite <orders@eventbrite.com>",
    html: `<html><body>
      <script type="application/ld+json">
      {
        "@type": "EventReservation",
        "reservationNumber": "EB22019",
        "reservationFor": {
          "@type": "Event",
          "name": "Roma Jazz Night",
          "startDate": "2026-12-05T21:00:00+01:00",
          "location": { "name": "Auditorium", "address": { "addressLocality": "Roma" } }
        }
      }
      </script>
    </body></html>`,
  },
  {
    id: "demo-bus",
    subject: "Pasaje de micro Córdoba – Mendoza",
    from: "Andesmar <pasajes@andesmar.com>",
    text: "Hola Ada. Tu pasaje de micro está confirmado. Código de reserva BUS441. Salida 20/11/2026 23:10 desde Córdoba hacia Mendoza.",
  },
  {
    id: "demo-cancel",
    subject: "Vuelo cancelado LA123",
    from: "LATAM <info@latam.com>",
    text: "Tu vuelo LA123 EZE a SCL del 15 de enero de 2026 fue cancelado. Código de reserva LA55ZZ.",
  },
  {
    id: "demo-noise",
    subject: "20% off flights this weekend",
    from: "Newsletter <news@example.com>",
    text: "Fly from EZE to MAD from $499. No reservation has been made.",
  },
];
