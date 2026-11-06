/** Gmail read helpers. The browser calls the API; these functions stay pure enough to test. */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const MAX_MESSAGES = 40;

const CLAUSES = {
  flight:
    '("FlightReservation" OR subject:itinerary OR subject:"boarding pass" OR subject:"e-ticket" OR subject:boarding OR subject:vuelo OR subject:pasaje OR subject:"flight confirmation" OR subject:"reserva de vuelo")',
  lodging:
    '("LodgingReservation" OR subject:hotel OR subject:airbnb OR subject:hostel OR subject:hospedaje OR subject:alojamiento OR subject:"check-in" OR subject:"check-out")',
  transport:
    '("RentalCarReservation" OR "TrainReservation" OR "BusReservation" OR subject:"alquiler de auto" OR subject:"rental car" OR subject:hertz OR subject:cabify OR subject:uber OR subject:tren OR subject:micro)',
  event:
    '("EventReservation" OR subject:eventbrite OR subject:ticketmaster OR subject:entrada OR subject:entradas OR subject:"your tickets" OR subject:concierto)',
};

export function buildQuery(profile) {
  const enabled = Object.entries(profile.categories || {})
    .filter(([, on]) => on)
    .map(([key]) => CLAUSES[key])
    .filter(Boolean);
  if (!enabled.length) return "";
  const days = clampDays(profile.lookbackDays);
  return `(${enabled.join(" OR ")}) newer_than:${days}d`;
}

export function decodeBase64Url(data) {
  if (!data) return "";
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
  if (typeof Buffer !== "undefined") {
    return Buffer.from(pad, "base64").toString("utf8");
  }
  const binary = atob(pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function headerValue(message, name) {
  const headers = message?.payload?.headers || [];
  const found = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

export function extractBodies(payload) {
  let text = "";
  let html = "";
  const walk = (part) => {
    if (!part) return;
    const mime = part.mimeType || "";
    if (part.body?.data && mime.startsWith("text/plain") && !text) text = decodeBase64Url(part.body.data);
    if (part.body?.data && mime.startsWith("text/html") && !html) html = decodeBase64Url(part.body.data);
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  if (!text && !html && payload?.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if ((payload.mimeType || "").includes("html")) html = decoded;
    else text = decoded;
  }
  return { text, html };
}

export function gmailToEmail(message) {
  const bodies = extractBodies(message.payload);
  return {
    id: message.id,
    subject: headerValue(message, "Subject"),
    from: headerValue(message, "From"),
    date: headerValue(message, "Date"),
    text: bodies.text,
    html: bodies.html,
  };
}

export async function listMessageIds(token, query, fetchImpl, max = MAX_MESSAGES) {
  const ids = [];
  let pageToken = "";
  while (ids.length < max) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(Math.min(20, max - ids.length)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await gmailGet(url, token, fetchImpl);
    for (const item of data.messages || []) ids.push(item.id);
    if (!data.nextPageToken || !(data.messages || []).length) break;
    pageToken = data.nextPageToken;
  }
  return ids.slice(0, max);
}

export async function getMessage(token, id, fetchImpl) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set("format", "full");
  return gmailGet(url, token, fetchImpl);
}

export async function getProfile(token, fetchImpl) {
  return gmailGet("https://gmail.googleapis.com/gmail/v1/users/me/profile", token, fetchImpl);
}

async function gmailGet(url, token, fetchImpl) {
  const response = await fetchImpl(String(url), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(`Gmail ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function clampDays(days) {
  const value = Number(days);
  if (!Number.isFinite(value)) return 120;
  return Math.min(365, Math.max(7, Math.round(value)));
}
