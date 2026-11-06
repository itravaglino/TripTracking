import type { Category } from "./categories";
import { decryptSecret, encryptSecret } from "./secrets";
import { sql } from "./db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

type ProfileRow = {
  id: string;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_token_expires_at: string | Date | null;
};

export type GmailMessage = {
  id: string;
  subject: string;
  html: string;
  text: string;
  ics: string;
};

const TERMS: Record<Category, string[]> = {
  flight: ["vuelo", "flight", "boarding", "e-ticket", "aerolinea", "airline"],
  lodging: ["hotel", "hospedaje", "airbnb", "alojamiento", "hostel"],
  transport: ["tren", "train", "omnibus", "bus", "transfer", "alquiler"],
  plan: ["tour", "excursión", "actividad", "itinerario", "entrada"],
  event: ["evento", "concierto", "conferencia", "festival"],
};

export function gmailQuery(categories: Category[], lookbackDays: number): string {
  const words = categories.flatMap((category) => TERMS[category]);
  const unique = [...new Set(words)].slice(0, 18);
  const subject = unique.map((word) => `subject:${JSON.stringify(word)}`).join(" OR ");
  const days = Math.min(365, Math.max(1, lookbackDays));
  return `newer_than:${days}d (${subject} OR filename:ics)`;
}

export async function accessTokenFor(profile: ProfileRow): Promise<string> {
  const refresh = decryptSecret(profile.refresh_token_enc);
  if (!refresh) throw new Error("missing_refresh_token");
  const expires = profile.access_token_expires_at ? new Date(profile.access_token_expires_at).getTime() : 0;
  const cached = decryptSecret(profile.access_token_enc);
  if (cached && expires - Date.now() > 60_000) return cached;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("refresh_failed");
  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("refresh_failed");
  const enc = encryptSecret(json.access_token);
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  if (enc) {
    await sql(
      "update profiles set access_token_enc = $2, access_token_expires_at = $3, updated_at = now() where id = $1",
      [profile.id, enc, expiresAt],
    );
  }
  return json.access_token;
}

export async function listTravelMessages(
  token: string,
  query: string,
  limit = 20,
): Promise<string[]> {
  const url = new URL(`${GMAIL}/messages`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(25, limit)));
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new Error("unauthorized");
  if (!response.ok) throw new Error("list_failed");
  const json = (await response.json()) as { messages?: { id: string }[] };
  return (json.messages ?? []).map((message) => message.id).slice(0, limit);
}

export async function readMessage(token: string, id: string): Promise<GmailMessage> {
  const response = await fetch(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new Error("unauthorized");
  if (!response.ok) throw new Error("read_failed");
  const json = (await response.json()) as {
    id: string;
    payload?: GmailPart;
  };
  const headers = json.payload?.headers ?? [];
  const subject = headers.find((header) => header.name.toLowerCase() === "subject")?.value ?? "";
  const collected = { html: "", text: "", ics: "" };
  walkPart(json.payload, collected);
  return {
    id: json.id,
    subject: subject.slice(0, 300),
    html: collected.html.slice(0, 200_000),
    text: collected.text.slice(0, 80_000),
    ics: collected.ics.slice(0, 200_000),
  };
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

function walkPart(part: GmailPart | undefined, into: { html: string; text: string; ics: string }): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  const filename = part.filename ?? "";
  const data = part.body?.data;
  const size = part.body?.size ?? 0;
  if (data && size < 500_000) {
    const decoded = decodeBase64Url(data);
    if (mime === "text/html" && into.html.length < 200_000) into.html += decoded;
    else if (mime === "text/plain" && into.text.length < 80_000) into.text += decoded;
    else if ((mime.includes("calendar") || filename.toLowerCase().endsWith(".ics")) && into.ics.length < 200_000) {
      into.ics += decoded;
    }
  }
  for (const child of part.parts ?? []) walkPart(child, into);
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  idToken: string | null;
}> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("exchange_failed");
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  if (!json.access_token) throw new Error("exchange_failed");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
    idToken: json.id_token ?? null,
  };
}

export function identityFromIdToken(idToken: string | null): { sub: string; email: string; name: string } | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: string;
      email?: string;
      name?: string;
      email_verified?: boolean;
    };
    if (!payload.sub || !payload.email || payload.email_verified === false) return null;
    return { sub: payload.sub, email: payload.email, name: payload.name ?? "" };
  } catch {
    return null;
  }
}
