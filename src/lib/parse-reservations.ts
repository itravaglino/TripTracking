import { type Category, isCategory } from "./categories";

export type ParsedReservation = {
  category: Category;
  title: string;
  provider: string | null;
  confirmationCode: string | null;
  status: "confirmed" | "cancelled" | "pending";
  startsAt: string | null;
  endsAt: string | null;
  origin: string | null;
  destination: string | null;
  location: string | null;
  details: Record<string, string>;
  dedupeKey: string;
};

const RESERVATION_WORD =
  /(reserva|reservation|booking|confirmad|confirmation|confirmación|confirmacion|itinerar|e-?ticket|localizador|pnr|código de reserva|codigo de reserva|boarding)/i;

const CATEGORY_RULES: { category: Category; pattern: RegExp }[] = [
  { category: "flight", pattern: /\b(vuelo|vuelos|flight|flights|airline|aerol[ií]nea|boarding pass|pase de abordar)\b/i },
  { category: "lodging", pattern: /\b(hotel|hostal|hostel|hospedaje|alojamiento|airbnb|check-?in|check-?out|habitaci[oó]n)\b/i },
  { category: "transport", pattern: /\b(tren|train|bus|ómnibus|omnibus|micro|alquiler de auto|rental car|transfer|cabify|remis|taxi)\b/i },
  { category: "event", pattern: /\b(evento|event|concierto|concert|conferencia|conference|festival|obra de teatro)\b/i },
  { category: "plan", pattern: /\b(tour|actividad|experiencia|excursi[oó]n|entrada|itinerario|restaurante|mesa)\b/i },
];

const TYPE_MAP: Record<string, Category> = {
  FlightReservation: "flight",
  Flight: "flight",
  LodgingReservation: "lodging",
  LodgingBusiness: "lodging",
  Hotel: "lodging",
  TrainReservation: "transport",
  TrainTrip: "transport",
  BusReservation: "transport",
  BusTrip: "transport",
  RentalCarReservation: "transport",
  TaxiReservation: "transport",
  FoodEstablishmentReservation: "plan",
  TouristTrip: "plan",
  Trip: "plan",
  EventReservation: "event",
  Event: "event",
};

export function parseReservationEmail(input: {
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  ics?: string | null;
}): ParsedReservation[] {
  const structured = [
    ...parseJsonLd(input.html ?? ""),
    ...parseIcs(input.ics ?? ""),
  ];
  if (structured.length > 0) return dedupe(structured);
  const heuristic = parseHeuristic(input.subject ?? "", input.text ?? stripHtml(input.html ?? ""));
  return heuristic ? [heuristic] : [];
}

function parseJsonLd(html: string): ParsedReservation[] {
  const found: ParsedReservation[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = decodeHtml(match[1] ?? "").trim();
    if (!raw) continue;
    try {
      collectNodes(JSON.parse(raw), found);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return found;
}

function collectNodes(node: unknown, found: ParsedReservation[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, found);
    return;
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray(record["@graph"])) collectNodes(record["@graph"], found);
  const types = asTypes(record["@type"]);
  const category = types.map((type) => TYPE_MAP[type]).find(Boolean);
  if (category && types.some((type) => type.endsWith("Reservation") || type === "Trip" || type === "TouristTrip")) {
    const parsed = fromSchema(category, record);
    if (parsed) found.push(parsed);
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") collectNodes(value, found);
  }
}

function fromSchema(category: Category, record: Record<string, unknown>): ParsedReservation | null {
  const reserved = asRecord(record.reservationFor);
  const provider =
    text(asRecord(reserved?.airline)?.name) ||
    text(asRecord(reserved?.provider)?.name) ||
    text(reserved?.name) ||
    null;
  const origin =
    placeName(reserved?.departureAirport) ||
    placeName(reserved?.departureStation) ||
    placeName(reserved?.departureBusStop) ||
    null;
  const destination =
    placeName(reserved?.arrivalAirport) ||
    placeName(reserved?.arrivalStation) ||
    placeName(reserved?.arrivalBusStop) ||
    null;
  const location =
    placeName(reserved?.location) ||
    addressText(asRecord(reserved?.address)) ||
    placeName(record.location) ||
    null;
  const startsAt =
    dateText(reserved?.departureTime) ||
    dateText(record.checkinTime) ||
    dateText(record.startTime) ||
    dateText(reserved?.startDate) ||
    dateText(record.reservationFor && asRecord(record.reservationFor)?.startDate) ||
    null;
  const endsAt =
    dateText(reserved?.arrivalTime) ||
    dateText(record.checkoutTime) ||
    dateText(record.endTime) ||
    dateText(reserved?.endDate) ||
    null;
  const code = text(record.reservationNumber) || text(record.confirmationNumber) || null;
  const flightNumber = text(reserved?.flightNumber);
  const airlineCode = text(asRecord(reserved?.airline)?.iataCode);
  const title = buildTitle(category, provider, origin, destination, location, flightNumber, airlineCode);
  if (!title) return null;
  const details: Record<string, string> = {};
  if (flightNumber) details.flightNumber = airlineCode ? `${airlineCode}${flightNumber}` : flightNumber;
  const under = text(asRecord(record.underName)?.name);
  if (under) details.passenger = under;
  return finalize({
    category,
    title,
    provider,
    confirmationCode: code,
    status: mapStatus(text(record.reservationStatus)),
    startsAt,
    endsAt,
    origin,
    destination,
    location,
    details,
  });
}

function parseIcs(ics: string): ParsedReservation[] {
  if (!/BEGIN:VEVENT/i.test(ics)) return [];
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const found: ParsedReservation[] = [];
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] ?? "";
    const fields = icsFields(body);
    const summary = fields.SUMMARY ?? "";
    const description = fields.DESCRIPTION ?? "";
    const blob = `${summary}\n${description}\n${fields.LOCATION ?? ""}`;
    if (!RESERVATION_WORD.test(blob) && !CATEGORY_RULES.some((rule) => rule.pattern.test(blob))) continue;
    const category = inferCategory(blob) ?? "plan";
    const startsAt = icsDate(fields.DTSTART);
    const endsAt = icsDate(fields.DTEND);
    const location = fields.LOCATION?.replace(/\\n/g, ", ").replace(/\\,/g, ",") ?? null;
    found.push(
      finalize({
        category,
        title: summary.replace(/\\,/g, ",").replace(/\\n/g, " ").trim() || "Reserva",
        provider: null,
        confirmationCode: fields.UID?.slice(0, 40) ?? null,
        status: /CANCEL/i.test(fields.STATUS ?? "") ? "cancelled" : "confirmed",
        startsAt,
        endsAt,
        origin: null,
        destination: null,
        location,
        details: {},
      }),
    );
  }
  return found;
}

function parseHeuristic(subject: string, text: string): ParsedReservation | null {
  const blob = `${subject}\n${text}`.slice(0, 6000);
  if (!RESERVATION_WORD.test(blob)) return null;
  const category = inferCategory(blob);
  if (!category) return null;
  const code = blob.match(
    /(?:localizador|pnr|c[oó]digo(?: de reserva)?|confirmation(?: number| code)?|reserva(?: n[ºo.]*)?)\s*[:#]?\s*([A-Z0-9]{5,8})\b/i,
  );
  const startsAt = findDate(blob);
  if (!code && !startsAt) return null;
  const route = blob.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|a)\s*([A-Z]{3})\b/);
  return finalize({
    category,
    title: subject.trim().slice(0, 180) || "Reserva",
    provider: null,
    confirmationCode: code?.[1]?.toUpperCase() ?? null,
    status: /cancelad|cancelled|canceled/i.test(blob) ? "cancelled" : "confirmed",
    startsAt,
    endsAt: null,
    origin: route?.[1] ?? null,
    destination: route?.[2] ?? null,
    location: null,
    details: {},
  });
}

function inferCategory(blob: string): Category | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(blob)) return rule.category;
  }
  return null;
}

function finalize(input: Omit<ParsedReservation, "dedupeKey">): ParsedReservation {
  const key = [
    input.category,
    (input.confirmationCode ?? "").toLowerCase(),
    input.startsAt ?? "",
    input.origin ?? "",
    input.destination ?? "",
    input.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80),
  ].join("|");
  return { ...input, dedupeKey: key };
}

function dedupe(items: ParsedReservation[]): ParsedReservation[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.dedupeKey)) return false;
    seen.add(item.dedupeKey);
    return true;
  });
}

function buildTitle(
  category: Category,
  provider: string | null,
  origin: string | null,
  destination: string | null,
  location: string | null,
  flightNumber: string | null,
  airlineCode: string | null,
): string {
  if (category === "flight" && origin && destination) {
    const number = flightNumber ? ` ${airlineCode ?? ""}${flightNumber}` : "";
    return `${provider ?? "Vuelo"}${number} ${origin} → ${destination}`.replace(/\s+/g, " ").trim();
  }
  if (provider && (origin || destination)) return `${provider} ${origin ?? ""} → ${destination ?? ""}`.trim();
  if (provider && location) return `${provider} · ${location}`;
  return provider || location || "";
}

function mapStatus(value: string | null): ParsedReservation["status"] {
  if (!value) return "confirmed";
  if (/cancel/i.test(value)) return "cancelled";
  if (/hold|pending|requested/i.test(value)) return "pending";
  return "confirmed";
}

function asTypes(value: unknown): string[] {
  if (typeof value === "string") return [value.replace(/^https?:\/\/schema\.org\//, "")];
  if (Array.isArray(value)) return value.flatMap((item) => asTypes(item));
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function dateText(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return null;
  return raw;
}

function placeName(value: unknown): string | null {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return null;
  const code = text(record.iataCode);
  const name = text(record.name);
  if (code && name) return `${name} (${code})`;
  return name || code || addressText(asRecord(record.address));
}

function addressText(address: Record<string, unknown> | null): string | null {
  if (!address) return null;
  const parts = [text(address.streetAddress), text(address.addressLocality), text(address.addressRegion), text(address.addressCountry)]
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function icsFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const split = line.indexOf(":");
    if (split <= 0) continue;
    const name = line.slice(0, split).split(";")[0]?.toUpperCase() ?? "";
    if (!name) continue;
    fields[name] = line.slice(split + 1).trim();
  }
  return fields;
}

function icsDate(value: string | undefined): string | null {
  if (!value) return null;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!compact) return dateText(value);
  const [, y, m, d, hh = "00", mm = "00", ss = "00"] = compact;
  const iso = value.endsWith("Z")
    ? `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`
    : `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const MONTHS: Record<string, string> = {
  ene: "01", enero: "01", jan: "01", january: "01",
  feb: "02", febrero: "02", february: "02",
  mar: "03", marzo: "03", march: "03",
  abr: "04", abril: "04", apr: "04", april: "04",
  may: "05", mayo: "05",
  jun: "06", junio: "06", june: "06",
  jul: "07", julio: "07", july: "07",
  ago: "08", agosto: "08", aug: "08", august: "08",
  sep: "09", sept: "09", septiembre: "09", september: "09",
  oct: "10", octubre: "10", october: "10",
  nov: "11", noviembre: "11", november: "11",
  dic: "12", diciembre: "12", dec: "12", december: "12",
};

function findDate(blob: string): string | null {
  const iso = blob.match(/\b(20\d{2}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (iso) return iso[2] ? `${iso[1]}T${iso[2]}:00` : iso[1];
  const dmy = blob.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const time = dmy[4] ? `T${dmy[4].padStart(2, "0")}:${dmy[5]}:00` : "";
    const isoDate = `${dmy[3]}-${month}-${day}${time}`;
    return Number.isNaN(Date.parse(isoDate)) ? null : isoDate;
  }
  const named = blob.match(
    /\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(20\d{2})(?:\s+a\s+las\s+(\d{1,2}):(\d{2}))?/i,
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (!month) return null;
    const time = named[4] ? `T${named[4].padStart(2, "0")}:${named[5]}:00` : "";
    return `${named[3]}-${month}-${named[1].padStart(2, "0")}${time}`;
  }
  return null;
}

function stripHtml(html: string): string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function assertCategory(value: string): Category {
  if (!isCategory(value)) throw new Error("category");
  return value;
}
