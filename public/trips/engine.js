export const CATEGORIES = ["flight", "lodging", "transport", "plan", "event"];

export const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];

const DEFAULT_TRACK = {
  flight: true,
  lodging: true,
  transport: true,
  plan: true,
  event: false,
};

const LD_CATEGORY = {
  FlightReservation: "flight",
  LodgingReservation: "lodging",
  RentalCarReservation: "transport",
  TrainReservation: "transport",
  BusReservation: "transport",
  TaxiReservation: "transport",
  BoatReservation: "transport",
  FoodEstablishmentReservation: "plan",
  EventReservation: "event",
};

const MONTHS = {
  ene: 1,
  enero: 1,
  jan: 1,
  january: 1,
  feb: 2,
  febrero: 2,
  february: 2,
  mar: 3,
  marzo: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  june: 6,
  jul: 7,
  julio: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  september: 9,
  oct: 10,
  octubre: 10,
  october: 10,
  nov: 11,
  noviembre: 11,
  november: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
  december: 12,
};

/**
 * @param {unknown} input
 * @returns {{ track: Record<"flight" | "lodging" | "transport" | "plan" | "event", boolean>, scanIntervalMinutes: number }}
 */
export function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawTrack = source.track && typeof source.track === "object" ? source.track : {};
  const track = {};
  for (const category of CATEGORIES) {
    track[category] = typeof rawTrack[category] === "boolean" ? rawTrack[category] : DEFAULT_TRACK[category];
  }
  if (!CATEGORIES.some((category) => track[category])) track.flight = true;
  const minutes = Number(source.scanIntervalMinutes);
  return {
    track,
    scanIntervalMinutes: INTERVALS.includes(minutes) ? minutes : 360,
  };
}

export function filterByTrack(items, track) {
  return items.filter((item) => item && track[item.category]);
}

export function parseMailboxMessage(message) {
  const subject = clip(message?.subject || "", 300);
  const from = clip(message?.from || "", 300);
  const messageId = clip(message?.messageId || "", 200);
  const html = String(message?.html || "").slice(0, 300_000);
  const text = String(message?.text || "").slice(0, 300_000);
  const fromLd = extractJsonLd(html)
    .flatMap((node) => flattenLd(node))
    .map((node) => reservationFromLd(node, { subject, from, messageId }))
    .filter(Boolean)
    .slice(0, 20);
  const strongLd = fromLd.filter((item) => item.startsAt || item.confirmationCode);
  if (strongLd.length > 0) return dedupeParsed(strongLd);
  const plain = text || htmlToText(html);
  const heuristic = reservationFromText(plain, { subject, from, messageId });
  return dedupeParsed([...(heuristic ? [heuristic] : []), ...fromLd]);
}

export function groupReservations(items) {
  const sorted = [...items].sort((a, b) => stamp(a.startsAt) - stamp(b.startsAt));
  const clusters = [];
  for (const item of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || !belongs(current, item)) clusters.push([item]);
    else current.push(item);
  }
  return clusters.map((group, index) => {
    const starts = group.map((item) => item.startsAt).filter(Boolean).sort();
    const ends = group.map((item) => item.endsAt || item.startsAt).filter(Boolean).sort();
    const place = majorityPlace(group);
    return {
      id: `trip-${index + 1}-${place || "viaje"}`,
      title: place || "Viaje",
      start: starts[0] || null,
      end: ends[ends.length - 1] || null,
      items: group,
    };
  });
}

function belongs(group, item) {
  const previous = group[group.length - 1];
  const previousEnd = stamp(previous.endsAt || previous.startsAt);
  const nextStart = stamp(item.startsAt);
  if (!previousEnd || !nextStart) return samePlace(previous, item);
  const gapHours = (nextStart - previousEnd) / 36e5;
  if (gapHours <= 48) return true;
  return gapHours <= 120 && samePlace(previous, item);
}

function samePlace(a, b) {
  const left = placeKey(a);
  const right = placeKey(b);
  return Boolean(left && right && left === right);
}

function placeKey(item) {
  return normalizePlace(item.destination || item.location || item.origin || "");
}

function majorityPlace(group) {
  const counts = new Map();
  for (const item of group) {
    const label = prettyPlace(item.destination || item.location || item.origin || "");
    const key = normalizePlace(label);
    if (!key) continue;
    const entry = counts.get(key) || { label, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  let best = "";
  let bestCount = 0;
  for (const entry of counts.values()) {
    if (entry.count > bestCount) {
      best = entry.label;
      bestCount = entry.count;
    }
  }
  return best;
}

function prettyPlace(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const withoutCode = clean.replace(/\(([A-Z]{3})\)/g, "").trim();
  return clip(withoutCode || clean, 80);
}

function normalizePlace(value) {
  return prettyPlace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stamp(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function reservationFromLd(node, context) {
  if (!node || typeof node !== "object") return null;
  const category = categoryFor(node);
  if (!category) return null;
  const reserved = node.reservationFor && typeof node.reservationFor === "object" ? node.reservationFor : {};
  const status = isCancelled(`${node.reservationStatus || ""} ${context.subject}`) ? "cancelled" : "confirmed";
  const confirmationCode = clip(
    node.reservationNumber || node.confirmationNumber || reserved.reservationNumber || "",
    40,
  );
  const party = personName(node.underName) || personName(node.reservationFor?.underName);
  const provider = providerFrom(context.from) || nameOf(node.provider) || nameOf(node.broker);
  const base = {
    category,
    status,
    provider,
    confirmationCode: String(confirmationCode).toUpperCase(),
    party,
    sourceSubject: context.subject,
    messageId: context.messageId,
    origin: "",
    destination: "",
    location: "",
    flightNumber: "",
    startsAt: null,
    endsAt: null,
    title: "",
    details: {},
  };

  if (category === "flight") {
    const depart = reserved.departureAirport || {};
    const arrive = reserved.arrivalAirport || {};
    base.origin = airportLabel(depart);
    base.destination = airportLabel(arrive);
    base.startsAt = instant(reserved.departureTime);
    base.endsAt = instant(reserved.arrivalTime);
    base.flightNumber = clip(reserved.flightNumber || "", 20);
    const airline = nameOf(reserved.airline) || provider;
    base.title = joinParts([joinParts([airline, base.flightNumber], " "), joinParts([iata(depart) || base.origin, iata(arrive) || base.destination], " → ")]);
    base.details = compactDetails({ seat: reserved.airplaneSeat || "" });
  } else if (category === "lodging") {
    base.location = nameOf(reserved) || nameOf(node.reservationFor);
    base.destination = addressLocality(reserved.address) || base.location;
    base.startsAt = instant(node.checkinTime || node.checkinDate || reserved.checkinTime);
    base.endsAt = instant(node.checkoutTime || node.checkoutDate || reserved.checkoutTime);
    base.title = base.location || "Hospedaje";
    base.details = compactDetails({ address: formatAddress(reserved.address) });
  } else if (category === "transport") {
    const pickup = reserved.pickupLocation || reserved.departureStation || reserved.departureBusStop || {};
    const dropoff = reserved.dropoffLocation || reserved.arrivalStation || reserved.arrivalBusStop || {};
    base.origin = placeLabel(pickup);
    base.destination = placeLabel(dropoff);
    base.location = base.destination || base.origin;
    base.startsAt = instant(reserved.pickupTime || reserved.departureTime || node.pickupTime);
    base.endsAt = instant(reserved.dropoffTime || reserved.arrivalTime || node.dropoffTime);
    base.flightNumber = clip(reserved.trainNumber || reserved.busNumber || reserved.flightNumber || "", 20);
    const company = nameOf(reserved.provider) || nameOf(reserved.trainCompany) || provider;
    base.title = joinParts([company || "Transporte", joinParts([base.origin, base.destination], " → ")]);
  } else {
    base.location = nameOf(reserved) || addressLocality(reserved.location?.address) || placeLabel(reserved.location);
    base.destination = addressLocality(reserved.location?.address || reserved.address) || base.location;
    base.startsAt = instant(reserved.startDate || node.startTime || reserved.doorTime);
    base.endsAt = instant(reserved.endDate || node.endTime);
    base.title = nameOf(reserved) || (category === "event" ? "Evento" : "Plan");
    base.details = compactDetails({ address: formatAddress(reserved.location?.address || reserved.address) });
  }

  if (!base.title) return null;
  return base;
}

function categoryFor(node) {
  const types = typesOf(node);
  const reserved = node.reservationFor && typeof node.reservationFor === "object" ? node.reservationFor : {};
  const fromReserved = categoryFromReserved(typesOf(reserved));
  if (fromReserved) return fromReserved;
  for (const type of types) {
    if (LD_CATEGORY[type]) return LD_CATEGORY[type];
  }
  return null;
}

function categoryFromReserved(types) {
  const has = (...names) => types.some((type) => names.includes(type));
  if (has("Flight")) return "flight";
  if (has("TrainTrip", "BusTrip", "Taxi", "TaxiService", "RentalCar", "BoatTrip", "Vehicle", "Car")) return "transport";
  if (types.some((type) => /^(Hotel|LodgingBusiness|Accommodation|Hostel|Resort|BedAndBreakfast|House|Apartment)$/.test(type) || type.startsWith("Lodging"))) {
    return "lodging";
  }
  if (types.some((type) => type.includes("FoodEstablishment") || type === "Restaurant")) return "plan";
  if (has("Event", "EventSeries", "ScreeningEvent")) return "event";
  if (has("TouristTrip", "TouristAttraction", "Tour")) return "plan";
  return null;
}

function isCancelled(text) {
  return /cancelad[oa]?|cancelaci[oó]n|\bcancel(?:led|ed)?\b|reembols/i.test(text);
}

function reservationFromText(plain, context) {
  const source = `${context.subject}\n${plain}`;
  const text = source.replace(/\s+/g, " ").trim();
  if (text.length < 12) return null;
  const cancelled = isCancelled(text);
  const confirmation = matchCode(text);
  const dates = findDates(source);
  const category = guessCategory(text);
  const namedPlace = matchNamedPlace(source, category);
  if (!category || dates.length === 0) return null;
  if ((category === "flight" || category === "transport") && !confirmation && !matchFlight(text)) return null;
  if ((category === "lodging" || category === "plan" || category === "event") && !confirmation && !namedPlace) return null;

  const flight = matchFlight(text);
  const route = matchRoute(source);
  const party = matchParty(source);
  const item = {
    category,
    status: cancelled ? "cancelled" : "confirmed",
    provider: providerFrom(context.from),
    confirmationCode: confirmation,
    party,
    sourceSubject: context.subject,
    messageId: context.messageId,
    origin: route.origin,
    destination: route.destination,
    location: namedPlace,
    flightNumber: flight,
    startsAt: dates[0] || null,
    endsAt: dates[1] || null,
    title: "",
    details: {},
  };

  if (category === "flight") {
    item.title = joinParts([flight || "Vuelo", joinParts([item.origin, item.destination], " → ")]);
  } else if (category === "lodging") {
    item.destination = item.destination || namedPlace;
    item.title = namedPlace || "Hospedaje";
  } else if (category === "transport") {
    item.title = joinParts([item.provider || "Transporte", joinParts([item.origin, item.destination], " → ")]);
  } else {
    item.destination = item.destination || namedPlace;
    item.title = namedPlace || (category === "event" ? "Evento" : "Plan");
  }
  return item.title ? item : null;
}

function guessCategory(text) {
  if (/\b(vuelo|flight|boarding|pasaje a[eé]reo)\b/i.test(text)) return "flight";
  if (/\b(hotel|hospedaje|airbnb|check-?in|check-?out|alojamiento)\b/i.test(text)) return "lodging";
  if (/\b(auto|car rental|alquiler de auto|hertz|avis|budget|tren|train|micro|colectivo|\bbus\b|cabify|uber|transfer|traslado)\b/i.test(text)) {
    return "transport";
  }
  if (/\b(concierto|recital|teatro|ticketmaster|evento|entrada general)\b/i.test(text)) return "event";
  if (/\b(tour|actividad|experiencia|reserva de mesa|restaurante)\b/i.test(text)) return "plan";
  return null;
}

function matchCode(text) {
  const match = text.match(
    /(?:c[oó]digo de reserva|localizador|pnr|confirmation code|record locator|booking reference|reserva)\s*[:#-]?\s*([A-Z0-9]{5,8})\b|(?:confirmation)\s*[:#-]\s*([A-Z0-9]{5,8})\b/i,
  );
  const code = match?.[1] || match?.[2] || "";
  return code ? code.toUpperCase() : "";
}

function matchFlight(text) {
  const match = text.match(/\b(?:vuelo|flight)?\s*([A-Z]{2})\s?(\d{2,4})\b/);
  if (!match) return "";
  const candidate = `${match[1]} ${match[2]}`.toUpperCase();
  if (/^(DE|LA|EL|UN|EN|AL|ES)\s/.test(candidate) && !/vuelo|flight/i.test(text)) return "";
  return candidate;
}

function matchRoute(text) {
  const salida = text.match(/salida:\s*([^\n]+)/i);
  const llegada = text.match(/llegada:\s*([^\n]+)/i);
  if (salida || llegada) {
    return {
      origin: cleanRouteStop(salida?.[1] || ""),
      destination: cleanRouteStop(llegada?.[1] || ""),
    };
  }
  const pair = text.match(/(?:desde|from)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ .()-]{3,40}?)\s+(?:a|to|hacia)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ .()-]{3,40})/i);
  if (!pair) return { origin: "", destination: "" };
  return { origin: clip(pair[1], 80), destination: clip(pair[2], 80) };
}

function cleanRouteStop(value) {
  return clip(String(value).replace(/\d{1,2}\s+de\s+.+$/i, "").trim(), 80);
}

function matchParty(text) {
  const match = text.match(/pasajer[oa]s?:\s*([^\n]+)/i);
  return match ? clip(match[1], 120) : "";
}

function matchNamedPlace(text, category) {
  if (category === "lodging") {
    const match = text.match(/\b((?:hotel|hostal|airbnb|apartamento)\s+[A-Za-zÁÉÍÓÚáéíóúñÑ0-9 .'-]{2,60})/i);
    return match ? clip(match[1], 80) : "";
  }
  if (category === "event" || category === "plan") {
    const match = text.match(/(?:en|at)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9 .'-]{3,60})/i);
    return match ? clip(match[1], 80) : "";
  }
  return "";
}

function findDates(text) {
  const found = [];
  const written = /(\d{1,2})\s+de\s+([a-záéíóú]{3,12})\.?\s+de\s+(\d{4})(?:[^\d\n]{0,16}(\d{1,2}):(\d{2}))?/gi;
  for (const match of text.matchAll(written)) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) continue;
    found.push(isoBuenosAires(Number(match[3]), month, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0)));
  }
  const english = /\b([A-Za-z]{3,12})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[^\d\n]{0,16}(\d{1,2}):(\d{2}))?/g;
  for (const match of text.matchAll(english)) {
    const month = MONTHS[match[1].toLowerCase()];
    if (!month) continue;
    found.push(isoBuenosAires(Number(match[3]), month, Number(match[2]), Number(match[4] || 0), Number(match[5] || 0)));
  }
  const englishDayFirst = /\b(\d{1,2})\s+([A-Za-z]{3,12})\.?\s+(\d{4})(?:[^\d\n]{0,16}(\d{1,2}):(\d{2}))?/g;
  for (const match of text.matchAll(englishDayFirst)) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) continue;
    found.push(isoBuenosAires(Number(match[3]), month, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0)));
  }
  const iso = /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?(Z|[+-]\d{2}:?\d{2})?/g;
  for (const match of text.matchAll(iso)) {
    const clock = `${match[2] || "00:00"}:00`;
    found.push(instant(`${match[1]}T${clock}${normalizeZone(match[3])}`));
  }
  return found.filter(Boolean).slice(0, 4);
}

function normalizeZone(zone) {
  if (!zone) return "-03:00";
  if (zone === "Z") return "Z";
  const compact = zone.match(/^([+-])(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}${compact[2]}:${compact[3]}`;
  return zone;
}

function isoBuenosAires(year, month, day, hour, minute) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return instant(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`);
}

function extractJsonLd(html) {
  const blocks = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = decodeEntities(match[1]).trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return blocks;
}

function flattenLd(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const entry of node) flattenLd(entry, out);
    return out;
  }
  if (typeof node !== "object") return out;
  out.push(node);
  if (node["@graph"]) flattenLd(node["@graph"], out);
  return out;
}

function typesOf(node) {
  if (!node || typeof node !== "object") return [];
  const value = node["@type"];
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((type) => String(type).replace(/^https?:\/\/schema\.org\//, ""));
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function instant(value) {
  if (!value || typeof value !== "string") return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function personName(value) {
  if (!value) return "";
  if (typeof value === "string") return clip(value, 120);
  return clip(value.name || "", 120);
}

function nameOf(value) {
  if (!value) return "";
  if (typeof value === "string") return clip(value, 160);
  return clip(value.name || "", 160);
}

function airportLabel(airport) {
  if (!airport || typeof airport !== "object") return "";
  const code = iata(airport);
  const city = addressLocality(airport.address) || nameOf(airport);
  if (city && code) return `${city} (${code})`;
  return city || code;
}

function iata(airport) {
  return clip(airport?.iataCode || "", 8).toUpperCase();
}

function addressLocality(address) {
  if (!address) return "";
  if (typeof address === "string") return clip(address, 120);
  return clip(address.addressLocality || address.name || "", 120);
}

function formatAddress(address) {
  if (!address) return "";
  if (typeof address === "string") return clip(address, 180);
  return clip(
    [address.streetAddress, address.addressLocality, address.addressCountry].filter(Boolean).join(", "),
    180,
  );
}

function placeLabel(value) {
  if (!value) return "";
  if (typeof value === "string") return clip(value, 120);
  return nameOf(value) || addressLocality(value.address) || airportLabel(value);
}

function providerFrom(from) {
  const match = String(from || "").match(/^\s*"?([^"<]+?)"?\s*</);
  if (match) return clip(match[1].trim(), 120);
  return clip(String(from || "").replace(/<[^>]+>/g, "").trim(), 120);
}

function compactDetails(details) {
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    const text = clip(value, 180);
    if (text) out[key] = text;
  }
  return out;
}

function joinParts(parts, separator = " · ") {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(separator);
}

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function dedupeParsed(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = [item.category, item.confirmationCode, item.startsAt, item.title].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const SAMPLE_MESSAGES = [
  {
    messageId: "sample-flight-mad",
    from: "LATAM Airlines <reservas@latam.com>",
    subject: "Tu vuelo a Madrid está confirmado",
    html: `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FlightReservation",
      reservationNumber: "QW8M2K",
      reservationStatus: "https://schema.org/ReservationConfirmed",
      underName: { "@type": "Person", name: "Ana Pérez" },
      reservationFor: {
        "@type": "Flight",
        flightNumber: "LA 8045",
        airline: { "@type": "Airline", name: "LATAM" },
        departureAirport: {
          "@type": "Airport",
          name: "Ezeiza",
          iataCode: "EZE",
          address: { addressLocality: "Buenos Aires" },
        },
        arrivalAirport: {
          "@type": "Airport",
          name: "Barajas",
          iataCode: "MAD",
          address: { addressLocality: "Madrid" },
        },
        departureTime: "2026-12-12T22:10:00-03:00",
        arrivalTime: "2026-12-13T14:40:00+01:00",
      },
    })}</script>`,
    text: "",
  },
  {
    messageId: "sample-hotel-mad",
    from: "Booking.com <noreply@booking.com>",
    subject: "Confirmación de hotel en Madrid",
    html: `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LodgingReservation",
      reservationNumber: "BK44190",
      reservationStatus: "https://schema.org/ReservationConfirmed",
      underName: { "@type": "Person", name: "Ana Pérez" },
      checkinTime: "2026-12-13T15:00:00+01:00",
      checkoutTime: "2026-12-18T11:00:00+01:00",
      reservationFor: {
        "@type": "LodgingBusiness",
        name: "Hotel Prado Norte",
        address: { streetAddress: "Calle de Zurbarán 12", addressLocality: "Madrid", addressCountry: "ES" },
      },
    })}</script>`,
    text: "",
  },
  {
    messageId: "sample-train",
    from: "Renfe <info@renfe.com>",
    subject: "Tu billete de tren",
    html: `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TrainReservation",
      reservationNumber: "RN22018",
      reservationStatus: "https://schema.org/ReservationConfirmed",
      underName: { "@type": "Person", name: "Ana Pérez" },
      reservationFor: {
        "@type": "TrainTrip",
        trainNumber: "AVE 3041",
        provider: { "@type": "Organization", name: "Renfe" },
        departureStation: { "@type": "TrainStation", name: "Madrid Puerta de Atocha" },
        arrivalStation: { "@type": "TrainStation", name: "Toledo" },
        departureTime: "2026-12-15T09:20:00+01:00",
        arrivalTime: "2026-12-15T10:05:00+01:00",
      },
    })}</script>`,
    text: "",
  },
  {
    messageId: "sample-tour",
    from: "Civitatis <reservas@civitatis.com>",
    subject: "Reserva confirmada: tour por el Prado",
    html: `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "EventReservation",
      reservationNumber: "CV7781",
      reservationStatus: "https://schema.org/ReservationConfirmed",
      underName: { "@type": "Person", name: "Ana Pérez" },
      reservationFor: {
        "@type": "TouristTrip",
        name: "Tour guiado por el Prado",
        startDate: "2026-12-15T16:30:00+01:00",
        endDate: "2026-12-15T18:30:00+01:00",
        location: { "@type": "Place", name: "Museo del Prado", address: { addressLocality: "Madrid" } },
      },
    })}</script>`,
    text: "",
  },
  {
    messageId: "sample-concert",
    from: "Ticketmaster <noreply@ticketmaster.es>",
    subject: "Tus entradas",
    html: `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "EventReservation",
      reservationNumber: "TM55021",
      reservationStatus: "https://schema.org/ReservationConfirmed",
      underName: { "@type": "Person", name: "Ana Pérez" },
      reservationFor: {
        "@type": "Event",
        name: "Concierto en Teatro Real",
        startDate: "2026-12-16T20:30:00+01:00",
        location: { "@type": "Place", name: "Teatro Real", address: { addressLocality: "Madrid" } },
      },
    })}</script>`,
    text: "",
  },
  {
    messageId: "sample-ar",
    from: "Aerolíneas Argentinas <reservas@aerolineas.com.ar>",
    subject: "Tu reserva está confirmada",
    html: "",
    text: `Pasajero: Ana Pérez
Vuelo AR 1130
Salida: Córdoba (COR) 4 de marzo de 2027 08:40
Llegada: Buenos Aires (AEP) 4 de marzo de 2027 10:05
Código de reserva: K7Q2PL`,
  },
  {
    messageId: "sample-cancel-hotel",
    from: "Hotel Austral <reservas@hotelaustral.example>",
    subject: "Reserva cancelada — Hotel Austral",
    html: "",
    text: `Tu reserva HTL9912 fue cancelada.
Check-in: 4 de marzo de 2027
Check-out: 6 de marzo de 2027
Hotel Austral, Buenos Aires`,
  },
];

export function sampleReservations() {
  return SAMPLE_MESSAGES.flatMap((message) => parseMailboxMessage(message));
}
