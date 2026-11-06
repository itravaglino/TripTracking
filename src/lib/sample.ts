import type { Category } from "./categories";

export type SampleReservation = {
  id: string;
  category: Category;
  title: string;
  provider: string | null;
  confirmationCode: string | null;
  status: "confirmed";
  startsAt: string;
  endsAt: string | null;
  origin: string | null;
  destination: string | null;
  location: string | null;
  details: Record<string, string>;
  sourceSubject: string | null;
  sample: true;
};

function iso(daysFromNow: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function sampleReservations(): SampleReservation[] {
  return [
    {
      id: "sample-flight",
      category: "flight",
      title: "Aerolíneas Argentinas AR1520 Córdoba (COR) → Buenos Aires (AEP)",
      provider: "Aerolíneas Argentinas",
      confirmationCode: "CORAEP",
      status: "confirmed",
      startsAt: iso(18, 11, 5),
      endsAt: iso(18, 12, 25),
      origin: "Córdoba (COR)",
      destination: "Aeroparque (AEP)",
      location: null,
      details: { flightNumber: "AR1520", passenger: "Pasajero de ejemplo" },
      sourceSubject: "Tu e-ticket AR1520",
      sample: true,
    },
    {
      id: "sample-lodging",
      category: "lodging",
      title: "Hotel de ejemplo · San Telmo",
      provider: "Hotel de ejemplo",
      confirmationCode: "STELMO",
      status: "confirmed",
      startsAt: iso(18, 18, 0),
      endsAt: iso(21, 11, 0),
      origin: null,
      destination: null,
      location: "San Telmo, Buenos Aires",
      details: {},
      sourceSubject: "Confirmación de reserva",
      sample: true,
    },
    {
      id: "sample-transport",
      category: "transport",
      title: "Transfer Aeroparque → San Telmo",
      provider: "Transfer de ejemplo",
      confirmationCode: "TRN01",
      status: "confirmed",
      startsAt: iso(18, 13, 0),
      endsAt: iso(18, 14, 0),
      origin: "Aeroparque",
      destination: "San Telmo",
      location: null,
      details: {},
      sourceSubject: "Reserva de transfer",
      sample: true,
    },
    {
      id: "sample-plan",
      category: "plan",
      title: "Recorrido a pie por San Telmo",
      provider: "Guía de ejemplo",
      confirmationCode: "WALK1",
      status: "confirmed",
      startsAt: iso(19, 16, 0),
      endsAt: iso(19, 18, 0),
      origin: null,
      destination: null,
      location: "Plaza Dorrego",
      details: {},
      sourceSubject: "Confirmación de actividad",
      sample: true,
    },
    {
      id: "sample-event",
      category: "event",
      title: "Concierto de ejemplo",
      provider: "Sala de ejemplo",
      confirmationCode: "SHOW1",
      status: "confirmed",
      startsAt: iso(20, 21, 0),
      endsAt: iso(20, 23, 0),
      origin: null,
      destination: null,
      location: "Buenos Aires",
      details: {},
      sourceSubject: "Entradas confirmadas",
      sample: true,
    },
  ];
}
