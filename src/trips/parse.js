/**
 * Turns a confirmation email into flight, lodging, transport, or event reservations.
 * Structured schema.org JSON-LD (what airlines and hotels embed) wins over text heuristics.
 */

const CATEGORY_BY_TYPE = {
  FlightReservation: "flight",
  LodgingReservation: "lodging",
  RentalCarReservation: "transport",
  TaxiReservation: "transport",
  BusReservation: "transport",
  TrainReservation: "transport",
  EventReservation: "event",
};

const MONTHS = {
  jan: 0, january: 0, ene: 0, enero: 0,
  feb: 1, february: 1, febrero: 1,
  mar: 2, march: 2, marzo: 2,
  apr: 3, april: 3, abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, junio: 5,
  jul: 6, july: 6, julio: 6,
  aug: 7, august: 7, ago: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, set: 8, septiembre: 8, setiembre: 8,
  oct: 9, october: 9, octubre: 9,
  nov: 10, november: 10, noviembre: 10,
  dec: 11, december: 11, dic: 11, diciembre: 11,
};

export function parseEmail(email) {
  const subject = email.subject || "";
  const from = email.from || "";
  const html = email.html || "";
  const text = email.text || stripHtml(html);
  const structured = extractJsonLd(html).flatMap((node) => mapSchemaNode(node));
  const found = structured.length ? structured : heuristicReservations({ subject, from, text });
  return found.map((item, index) => ({
    category: item.category,
    status: item.status || "confirmed",
    title: clean(item.title),
    provider: clean(item.provider),
    confirmationCode: clean(item.confirmationCode).toUpperCase(),
    start: item.start || "",
    end: item.end || "",
    origin: clean(item.origin),
    destination: clean(item.destination),
    location: clean(item.location),
    passenger: clean(item.passenger),
    detail: clean(item.detail),
    sourceMessageId: email.id || "",
    sourceSubject: subject,
    sourceFrom: from,
    index,
  }));
}

export function extractJsonLd(html) {
  if (!html) return [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes = [];
  let match;
  while ((match = re.exec(html))) {
    const raw = match[1].replace(/<!--|-->/g, "").trim();
    try {
      nodes.push(...flattenNodes(JSON.parse(raw)));
    } catch {
      /* confirmation mail with a broken block still falls through to text */
    }
  }
  return nodes;
}

function flattenNodes(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flattenNodes);
  if (typeof node !== "object") return [];
  if (Array.isArray(node["@graph"])) return flattenNodes(node["@graph"]);
  return [node];
}

function mapSchemaNode(node) {
  const type = schemaType(node["@type"]);
  const category = CATEGORY_BY_TYPE[type];
  if (!category) return [];
  const status = schemaStatus(node.reservationStatus);
  const code = node.reservationNumber || node.reservationId || "";
  const passenger = personName(node.underName);
  const provider = providerName(node, type);

  if (type === "FlightReservation") {
    return asArray(node.reservationFor).map((flight) => ({
      category,
      status,
      title: flightTitle(flight),
      provider: textName(flight?.airline) || provider,
      confirmationCode: code,
      start: flight?.departureTime || node.departureTime || "",
      end: flight?.arrivalTime || node.arrivalTime || "",
      origin: placeLabel(flight?.departureAirport),
      destination: placeLabel(flight?.arrivalAirport),
      location: "",
      passenger,
      detail: flight?.flightNumber || "",
    }));
  }

  if (type === "LodgingReservation") {
    const stay = node.reservationFor || {};
    return [{
      category,
      status,
      title: textName(stay) || "Lodging",
      provider: provider || textName(stay),
      confirmationCode: code,
      start: node.checkinTime || node.checkinDate || "",
      end: node.checkoutTime || node.checkoutDate || "",
      origin: "",
      destination: locality(stay.address),
      location: formatAddress(stay.address),
      passenger,
      detail: "",
    }];
  }

  if (type === "EventReservation") {
    const event = node.reservationFor || {};
    const place = event.location;
    return [{
      category,
      status,
      title: textName(event) || "Event",
      provider: provider || textName(event?.organizer),
      confirmationCode: code,
      start: event.startDate || "",
      end: event.endDate || "",
      origin: "",
      destination: locality(place?.address) || textName(place),
      location: formatAddress(place?.address) || textName(place),
      passenger,
      detail: "",
    }];
  }

  const vehicle = node.reservationFor || {};
  const pickup = node.pickupLocation || node.departureStation || node.departureBusStop;
  const dropoff = node.dropoffLocation || node.arrivalStation || node.arrivalBusStop;
  return [{
    category,
    status,
    title: transportTitle(type, vehicle, provider),
    provider: provider || textName(vehicle?.provider) || textName(vehicle?.brand),
    confirmationCode: code,
    start: node.pickupTime || node.departureTime || "",
    end: node.dropoffTime || node.arrivalTime || "",
    origin: placeLabel(pickup),
    destination: placeLabel(dropoff),
    location: placeLabel(pickup),
    passenger,
    detail: "",
  }];
}

export function heuristicReservations({ subject, from, text }) {
  const blob = `${subject}\n${from}\n${text}`;
  const category = detectCategory(blob);
  if (!category) return [];
  const confirmationCode = findCode(blob);
  const route = findRoute(blob);
  const flightNumber = findFlightNumber(blob);
  const dates = findDates(blob);
  const cancelled = /\b(cancelad[oa]s?|cancelled|canceled)\b/i.test(blob);

  if (category === "flight") {
    const strong = confirmationCode || (route && dates.length) || (flightNumber && dates.length);
    if (!strong) return [];
    return [{
      category,
      status: cancelled ? "cancelled" : "confirmed",
      title: flightNumber ? `Flight ${flightNumber}` : route ? `${route.origin} → ${route.destination}` : subject || "Flight",
      provider: senderName(from),
      confirmationCode,
      start: dates[0] || "",
      end: dates[1] || "",
      origin: route?.origin || "",
      destination: route?.destination || "",
      location: "",
      passenger: "",
      detail: flightNumber,
    }];
  }

  if (category === "lodging") {
    if (!confirmationCode && dates.length < 1) return [];
    const hotel = findHotelName(subject, text) || senderName(from) || "Lodging";
    return [{
      category,
      status: cancelled ? "cancelled" : "confirmed",
      title: hotel,
      provider: senderName(from),
      confirmationCode,
      start: dates[0] || "",
      end: dates[1] || "",
      origin: "",
      destination: "",
      location: "",
      passenger: "",
      detail: "",
    }];
  }

  if (category === "transport") {
    if (!confirmationCode && dates.length < 1 && !route) return [];
    return [{
      category,
      status: cancelled ? "cancelled" : "confirmed",
      title: subject || senderName(from) || "Transport",
      provider: senderName(from),
      confirmationCode,
      start: dates[0] || "",
      end: dates[1] || "",
      origin: route?.origin || "",
      destination: route?.destination || "",
      location: "",
      passenger: "",
      detail: "",
    }];
  }

  if (!confirmationCode && dates.length < 1) return [];
  return [{
    category,
    status: cancelled ? "cancelled" : "confirmed",
    title: subject || "Event",
    provider: senderName(from),
    confirmationCode,
    start: dates[0] || "",
    end: dates[1] || "",
    origin: "",
    destination: "",
    location: "",
    passenger: "",
    detail: "",
  }];
}

function detectCategory(blob) {
  const scores = { flight: 0, lodging: 0, transport: 0, event: 0 };
  if (/\b(vuelo|boarding pass|e-?ticket|flight reservation|itinerary|aerol[ií]neas|boarding)\b/i.test(blob)) {
    scores.flight += 2;
  }
  if (/\bpasaje\b/i.test(blob) && !/\b(micro|colectivo|[oó]mnibus|bus)\b/i.test(blob)) scores.flight += 2;
  if (/\b(hotel|hostal|hostel|airbnb|alojamiento|hospedaje|lodging)\b/i.test(blob)) scores.lodging += 2;
  if (/\b(alquiler de auto|rental car|rent a car|hertz|avis|cabify|uber|tren|train ticket|micro|colectivo|bus ticket|[oó]mnibus)\b/i.test(blob)) {
    scores.transport += 3;
  }
  if (/\b(entrada|entradas|eventbrite|ticketmaster|concierto|concert|obra de teatro|your tickets)\b/i.test(blob)) {
    scores.event += 2;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "";
}

function findCode(blob) {
  const match = blob.match(
    /(?:c[oó]digo de (?:reserva|confirmaci[oó]n)|confirmation(?:\s+(?:code|number))?|record locator|localizador|booking (?:reference|number)|pnr|reserva)\s*[:#]?\s*([A-Z0-9]{5,8})\b/i
  );
  return match ? match[1] : "";
}

function findRoute(blob) {
  const match = blob.match(/\b([A-Z]{3})\s*(?:→|->|–|—| a | to )\s*([A-Z]{3})\b/);
  if (!match) return null;
  return { origin: match[1], destination: match[2] };
}

function findFlightNumber(blob) {
  const match = blob.match(/\b(?:vuelo|flight)\s*([A-Z]{1,2}\d?|\d[A-Z])\s?(\d{2,4})\b/i);
  if (!match) return "";
  return `${match[1].toUpperCase()}${match[2]}`;
}

export function findDates(blob) {
  const found = [];
  const iso = /\b(20\d{2}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/g;
  let match;
  while ((match = iso.exec(blob))) {
    found.push(match[2] ? `${match[1]}T${match[2]}` : match[1]);
  }
  const written = /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(20\d{2})\b/gi;
  while ((match = written.exec(blob))) {
    const month = MONTHS[stripAccents(match[2].toLowerCase())];
    if (month == null) continue;
    found.push(isoDate(Number(match[3]), month, Number(match[1])));
  }
  const en = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/g;
  while ((match = en.exec(blob))) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month == null) continue;
    found.push(isoDate(Number(match[3]), month, Number(match[2])));
  }
  const dmy = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/g;
  while ((match = dmy.exec(blob))) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    found.push(isoDate(Number(match[3]), month - 1, day));
  }
  return [...new Set(found)];
}

function findHotelName(subject, text) {
  const quoted = text.match(/hotel\s+["“]([^"”]+)["”]/i);
  if (quoted) return quoted[1];
  const line = text.match(/\b(?:hotel|hostal|hostel)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'’. -]{2,60})/);
  if (line) return line[1].trim();
  if (/hotel|airbnb|hostal/i.test(subject)) return subject.replace(/^(re|fwd):\s*/i, "").trim();
  return "";
}

function schemaType(type) {
  const value = Array.isArray(type) ? type[0] : type;
  if (!value) return "";
  return String(value).split("/").pop();
}

function schemaStatus(status) {
  const value = String(status || "");
  if (/cancel/i.test(value)) return "cancelled";
  return "confirmed";
}

function flightTitle(flight) {
  const number = flight?.flightNumber || "";
  const airline = textName(flight?.airline);
  if (airline && number) return `${airline} ${number}`;
  return number || airline || "Flight";
}

function transportTitle(type, vehicle, provider) {
  if (type === "RentalCarReservation") return provider || textName(vehicle) || "Rental car";
  if (type === "TrainReservation") return textName(vehicle) || "Train";
  if (type === "BusReservation") return textName(vehicle) || "Bus";
  return textName(vehicle) || provider || "Transport";
}

function providerName(node, type) {
  if (type === "FlightReservation") return textName(asArray(node.reservationFor)[0]?.airline);
  if (type === "RentalCarReservation") return textName(node.reservationFor?.provider) || textName(node.provider);
  return textName(node.provider) || textName(node.reservationFor?.provider);
}

function personName(person) {
  if (!person) return "";
  if (typeof person === "string") return person;
  return person.name || "";
}

function textName(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  return node.name || node.iataCode || "";
}

function placeLabel(place) {
  if (!place) return "";
  if (typeof place === "string") return place;
  const code = place.iataCode || "";
  const name = place.name || "";
  if (code && name && !name.includes(code)) return `${code} · ${name}`;
  return code || name || locality(place.address);
}

function locality(address) {
  if (!address || typeof address === "string") return address || "";
  return address.addressLocality || "";
}

function formatAddress(address) {
  if (!address) return "";
  if (typeof address === "string") return address;
  return [address.streetAddress, address.addressLocality, address.addressCountry].filter(Boolean).join(", ");
}

function senderName(from) {
  if (!from) return "";
  const named = from.match(/^([^<]+)</);
  if (named) return named[1].replace(/["']/g, "").trim();
  return from.split("@")[0];
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAccents(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return "";
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
