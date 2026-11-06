import { buildQuery, getMessage, gmailToEmail, listMessageIds } from "./gmail.js";
import { parseEmail } from "./parse.js";

export async function readMailbox({ profile, token, fetchImpl, messages }) {
  if (messages) return messages.flatMap((message) => parseEmail(message));
  const query = buildQuery(profile);
  if (!query || !token) return [];
  const ids = await listMessageIds(token, query, fetchImpl);
  const found = [];
  for (const id of ids) {
    const message = await getMessage(token, id, fetchImpl);
    found.push(...parseEmail(gmailToEmail(message)));
  }
  return found;
}
