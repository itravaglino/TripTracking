const MONTHS = {
  enero: 1,
  ene: 1,
  january: 1,
  jan: 1,
  febrero: 2,
  feb: 2,
  february: 2,
  marzo: 3,
  mar: 3,
  march: 3,
  abril: 4,
  abr: 4,
  april: 4,
  apr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  june: 6,
  julio: 7,
  jul: 7,
  july: 7,
  agosto: 8,
  ago: 8,
  august: 8,
  aug: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  sept: 9,
  september: 9,
  octubre: 10,
  oct: 10,
  october: 10,
  noviembre: 11,
  nov: 11,
  november: 11,
  diciembre: 12,
  dic: 12,
  december: 12,
  dec: 12,
};

const AIRLINES =
  /\b(latam|aerol[ií]neas|jetsmart|flybondi|iberia|avianca|lufthansa|emirates|qatar|copa airlines|american airlines|united airlines|delta|air france|klm|volaris|british airways|gol linhas|sky airline)\b/i;

const AIRLINE_CODES = new Set([
  "LA", "AR", "WJ", "FO", "IB", "G3", "AV", "AA", "UA", "DL", "LH", "AF", "KL",
  "CM", "H2", "Y4", "VB", "EK", "QR", "BA", "AM", "UX", "TP", "AZ", "LX", "JA",
]);

const LODGING =
  /\b(airbnb|booking\.com|hotel|hostel|hospedaje|alojamiento|check-in|check-out|checkout|hotels\.com|despegar|hostelworld)\b/i;

const TRANSPORT =
  /\b(uber|cabify|didi|taxi|remis|transfer|tren|train|ómnibus|omnibus|colectivo|andesmar|flechabus|plataforma 10|renfe|amtrak|hertz|avis|alquiler de auto|car rental|butaca)\b/i;

const PLANS =
  /\b(restaurante|restaurant|mesa para|getyourguide|viator|museo|museum|tour\b|actividad|experiencia)\b/i;

const EVENTS =
  /\b(concierto|concert|conferencia|conference|webinar|ticketmaster|passline|festival|meetup|show|evento|entradas?)\b/i;

const MONTH_NAMES = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function iso(year, month, day, hour, minute, hasTime) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (!hasTime) return date;
  if (hour > 23 || minute > 59) return null;
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

function monthNumber(name) {
  return MONTHS[String(name || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")] || null;
}

function pushDate(found, value, index) {
  if (!value) return;
  found.push({ value, index });
}

export function findDates(text) {
  const found = [];
  const used = [];
  const claim = (index, length, value) => {
    if (!value) return;
    if (used.some((span) => index < span.end && index + length > span.start)) return;
    used.push({ start: index, end: index + length });
    pushDate(found, value, index);
  };

  const source = String(text || "");
  for (const match of source.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/g)) {
    claim(
      match.index,
      match[0].length,
      iso(+match[1], +match[2], +match[3], +(match[4] || 0), +(match[5] || 0), Boolean(match[4])),
    );
  }
  for (const match of source.matchAll(
    /\b(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+de\s+(20\d{2})(?:,?\s+(\d{1,2}):(\d{2}))?/gi,
  )) {
    claim(
      match.index,
      match[0].length,
      iso(+match[3], monthNumber(match[2]), +match[1], +(match[4] || 0), +(match[5] || 0), Boolean(match[4])),
    );
  }
  for (const match of source.matchAll(
    /\b(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,10})\.?\s+(20\d{2})(?:[,\s]+(\d{1,2}):(\d{2}))?/gi,
  )) {
    claim(
      match.index,
      match[0].length,
      iso(+match[3], monthNumber(match[2]), +match[1], +(match[4] || 0), +(match[5] || 0), Boolean(match[4])),
    );
  }
  for (const match of source.matchAll(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lun|Mar|Mi[eé]|Jue|Vie|S[aá]b|Dom)[a-z]*\.?,?\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s+(20\d{2})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/gi,
  )) {
    let hour = match[4] == null ? 0 : +match[4];
    const ampm = (match[6] || "").toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    claim(
      match.index,
      match[0].length,
      iso(+match[3], monthNumber(match[1]), +match[2], hour, +(match[5] || 0), Boolean(match[4])),
    );
  }
  for (const match of source.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2}),\s+(20\d{2})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/g)) {
    let hour = match[4] == null ? 0 : +match[4];
    const ampm = (match[6] || "").toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    claim(
      match.index,
      match[0].length,
      iso(+match[3], monthNumber(match[1]), +match[2], hour, +(match[5] || 0), Boolean(match[4])),
    );
  }
  for (const match of source.matchAll(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/g)) {
    claim(
      match.index,
      match[0].length,
      iso(+match[3], +match[2], +match[1], +(match[4] || 0), +(match[5] || 0), Boolean(match[4])),
    );
  }

  found.sort((a, b) => a.index - b.index);
  const unique = [];
  for (const item of found) {
    if (!unique.includes(item.value)) unique.push(item.value);
  }
  return unique;
}

export function formatWhen(value, lang) {
  if (!value) return "";
  const [date, time] = String(value).split("T");
  const [year, month, day] = date.split("-");
  const names = MONTH_NAMES[lang === "en" ? "en" : "es"];
  const label = `${Number(day)} ${names[Number(month) - 1]} ${year}`;
  return time ? `${label} ${time}` : label;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function field(text, labels) {
  const pattern = new RegExp(`(?:${labels.join("|")})\\s*[:\\-]\\s*([^\\n]+)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function confirmationCode(text) {
  const match = text.match(
    /(?:c[oó]digo(?:\s+de\s+(?:reserva|confirmaci[oó]n))?|confirmation\s+code|record\s+locator|localizador|\bpnr\b|booking\s+(?:code|number|id))\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,14})/i,
  );
  return match ? match[1].toUpperCase() : "";
}

function priceOf(text) {
  const match = text.match(/\b(USD|EUR|ARS|GBP)\s?(\d[\d.,]*)/i) || text.match(/(US\$|\$|€)\s?(\d[\d.,]*)/);
  if (!match) return { price: "", currency: "" };
  const raw = match[1].toUpperCase();
  const currency = raw === "US$" || raw === "$" ? "USD" : raw === "€" ? "EUR" : raw;
  return { price: match[2], currency };
}

function airports(text) {
  return [...text.matchAll(/([\p{L}][\p{L} .'-]{1,40}?)\s*\(([A-Z]{3})\)/gu)].map((match) => ({
    city: match[1].trim(),
    code: match[2],
  }));
}

function flightNumber(text) {
  for (const match of text.matchAll(/\b([A-Z]{2})\s?(\d{2,4})\b/g)) {
    if (AIRLINE_CODES.has(match[1])) return `${match[1]} ${match[2]}`;
  }
  return "";
}

function scoreText(text) {
  const scores = { flight: 0, lodging: 0, transport: 0, plan: 0, event: 0 };
  if (/\b(vuelo|flight|boarding pass|e-ticket|pasaje a[eé]reo|itinerary|itinerario)\b/i.test(text)) scores.flight += 3;
  if (AIRLINES.test(text)) scores.flight += 4;
  if (flightNumber(text)) scores.flight += 3;
  if (LODGING.test(text)) scores.lodging += 4;
  if (/\b(check-in|checkout|check-out)\b/i.test(text) && /\b(hotel|airbnb|hostel|room|habitaci[oó]n)\b/i.test(text)) {
    scores.lodging += 2;
  }
  if (TRANSPORT.test(text)) scores.transport += 4;
  if (/\bpasaje\b/i.test(text)) scores.transport += 1;
  if (PLANS.test(text)) scores.plan += 4;
  if (EVENTS.test(text)) scores.event += 4;
  if (/\b(show|concierto|festival)\b/i.test(text)) scores.event += 2;
  return scores;
}

function winner(scores) {
  let best = "";
  let value = 2;
  for (const [key, score] of Object.entries(scores)) {
    if (score > value) {
      best = key;
      value = score;
    }
  }
  return best;
}

function cleanSubject(subject) {
  return String(subject || "")
    .replace(/^(re|fw|fwd)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function stripSchedule(value) {
  return String(value || "")
    .replace(/\b\d{1,2}[\/.]\d{1,2}[\/.]20\d{2}(?:\s+\d{1,2}:\d{2})?/g, " ")
    .replace(/\b\d{1,2}\s+de\s+\p{L}+\s+de\s+20\d{2}(?:,?\s+\d{1,2}:\d{2})?/giu, " ")
    .replace(/\b\d{1,2}\s+\p{L}{3,10}\.?\s+20\d{2}(?:[,\s]+\d{1,2}:\d{2})?/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function partyOf(text) {
  const named = text.match(/(?:pasajero|passenger|hu[eé]sped|guest)\s*[:\-]?\s*([^\n]+)/i);
  if (named) return named[1].trim().slice(0, 80);
  const count = text.match(/\b(\d+)\s+(?:guests?|hu[eé]spedes|pasajeros|personas)\b/i) || text.match(/\bmesa para\s+(\d+)/i);
  return count ? count[1] : "";
}

export function parseReservation({ subject = "", body = "", id = "" } = {}) {
  const text = stripHtml(`${subject}\n${body}`);
  const category = winner(scoreText(text));
  if (!category) return null;

  const dates = findDates(text);
  const ports = airports(text);
  const code = confirmationCode(text);
  const money = priceOf(text);
  const number = flightNumber(text);
  const provider =
    field(text, ["aerol[ií]nea", "airline", "hotel", "host"]) ||
    (text.match(AIRLINES) || text.match(LODGING) || text.match(TRANSPORT) || [""])[0];

  let origin = "";
  let destination = "";
  let place = "";
  if (ports.length >= 2) {
    origin = `${ports[0].city} (${ports[0].code})`;
    destination = `${ports[1].city} (${ports[1].code})`;
  } else if (ports.length === 1) {
    place = `${ports[0].city} (${ports[0].code})`;
  }

  const fromTo = text.match(/\b(?:de|from)\s+([\p{L}][\p{L} .'-]{1,40}?)\s+(?:a|to)\s+([\p{L}][\p{L} .'-]{1,40})/iu);
  if (!origin && fromTo && category !== "plan" && category !== "event") {
    origin = fromTo[1].trim();
    destination = fromTo[2].trim();
  }
  const pickup = stripSchedule(field(text, ["pickup", "salida", "origen"]));
  const dropoff = stripSchedule(field(text, ["drop-?off", "dropoff", "llegada", "destino"]));
  if (!origin && pickup && /[\p{L}]/u.test(pickup)) origin = pickup;
  if (!destination && dropoff && /[\p{L}]/u.test(dropoff)) destination = dropoff;

  place = place || field(text, ["lugar", "place", "direcci[oó]n", "address", "hotel"]);
  if (category === "lodging" && !place) {
    const going = text.match(/going to\s+([^\n]+)/i);
    if (going) place = going[1].trim();
  }

  const routeTitle = [category === "flight" ? number : "", destination || place].filter(Boolean).join(" · ");
  const title =
    category === "flight" || category === "lodging" || category === "transport"
      ? routeTitle || cleanSubject(subject) || category
      : cleanSubject(subject) || routeTitle || category;

  return {
    id: id ? `${category}:${id}` : "",
    messageId: id,
    category,
    title: title.slice(0, 140),
    provider: String(provider || "").slice(0, 80),
    confirmationCode: code,
    startsAt: dates[0] || "",
    endsAt: dates[1] || "",
    origin: origin.slice(0, 80),
    destination: destination.slice(0, 80),
    place: place.slice(0, 120),
    party: partyOf(text),
    price: money.price,
    currency: money.currency,
    summary: [cleanSubject(subject), code].filter(Boolean).join(" · ").slice(0, 180),
  };
}

export function parseMessages(messages, categories) {
  const items = [];
  for (const message of messages || []) {
    const parsed = parseReservation(message);
    if (!parsed) continue;
    if (categories && categories[parsed.category] === false) continue;
    items.push(parsed);
  }
  return items;
}

function placeKey(item) {
  return [item.destination, item.place, item.origin]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function sharesPlace(items, item) {
  const key = placeKey(item);
  if (!key) return false;
  return items.some((other) => {
    const otherKey = placeKey(other);
    if (!otherKey) return false;
    return key.split(/[^\p{L}]+/u).filter((word) => word.length > 3).some((word) => otherKey.includes(word));
  });
}

export function tripTitle(items, lang) {
  const flight = items.find((item) => item.category === "flight" && item.destination);
  if (flight) return flight.destination;
  const stay = items.find((item) => item.category === "lodging" && (item.place || item.destination));
  if (stay) return stay.place || stay.destination;
  const anywhere = items.find((item) => item.destination || item.place || item.origin);
  if (anywhere) return anywhere.destination || anywhere.place || anywhere.origin;
  const dated = items.find((item) => item.startsAt);
  if (!dated) return lang === "en" ? "Unscheduled" : "Sin fecha";
  return `${lang === "en" ? "Trip" : "Viaje"} · ${formatWhen(dated.startsAt, lang)}`;
}

export function groupTrips(reservations, lang = "es") {
  const items = [...(reservations || [])].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  const trips = [];
  let undated = null;
  for (const item of items) {
    if (!item.startsAt) {
      if (!undated) {
        undated = { items: [] };
        trips.push(undated);
      }
      undated.items.push(item);
      continue;
    }
    const start = Date.parse(item.startsAt.length === 10 ? `${item.startsAt}T12:00:00` : item.startsAt);
    let host = null;
    let bestGap = Infinity;
    for (const trip of trips) {
      if (!trip.endMs) continue;
      const gap = start - trip.endMs;
      const near = gap >= -3 * 86400000 && gap <= 2 * 86400000;
      const same = sharesPlace(trip.items, item) && Math.abs(gap) <= 7 * 86400000;
      if ((near || same) && Math.abs(gap) < bestGap) {
        host = trip;
        bestGap = Math.abs(gap);
      }
    }
    const end = Date.parse((item.endsAt || item.startsAt).length === 10 ? `${item.endsAt || item.startsAt}T12:00:00` : item.endsAt || item.startsAt);
    if (!host) {
      trips.push({ items: [item], endMs: end });
    } else {
      host.items.push(item);
      host.endMs = Math.max(host.endMs, end);
    }
  }
  return trips.map((trip) => ({
    id: trip.items.map((item) => item.id).join("|"),
    title: tripTitle(trip.items, lang),
    items: trip.items,
  }));
}
