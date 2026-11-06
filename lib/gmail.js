import { mailboxQuery } from "./mailbox.js";

export function decodeBase64Url(data) {
  if (!data) return "";
  const normalized = String(data).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function collect(part, mime, chunks) {
  if (!part) return;
  if (part.mimeType === mime && part.body?.data) chunks.push(decodeBase64Url(part.body.data));
  for (const child of part.parts || []) collect(child, mime, chunks);
}

export function messageText(payload) {
  const plain = [];
  collect(payload, "text/plain", plain);
  if (plain.length) return plain.join("\n").slice(0, 20000);
  const html = [];
  collect(payload, "text/html", html);
  if (html.length) return html.join("\n").slice(0, 20000);
  if (payload?.body?.data) return decodeBase64Url(payload.body.data).slice(0, 20000);
  return "";
}

async function gmail(fetchImpl, accessToken, url) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "gmail_unauthorized" : "gmail_failed");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function mailboxAddress(accessToken, fetchImpl = fetch) {
  const profile = await gmail(fetchImpl, accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
  return profile.emailAddress || "";
}

export async function readMailbox({ accessToken, sinceMs, fetchImpl = fetch, limit = 20 }) {
  const query = encodeURIComponent(mailboxQuery(sinceMs));
  const list = await gmail(
    fetchImpl,
    accessToken,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${query}`,
  );
  const messages = [];
  for (const item of (list.messages || []).slice(0, limit)) {
    const full = await gmail(
      fetchImpl,
      accessToken,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
    );
    const headers = full.payload?.headers || [];
    const subject = headers.find((header) => header.name?.toLowerCase() === "subject")?.value || "";
    messages.push({ id: full.id, subject, body: messageText(full.payload) });
  }
  return messages;
}
