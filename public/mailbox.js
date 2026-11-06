export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function mailboxQuery(sinceMs) {
  const terms =
    "(subject:reserva OR subject:reservation OR subject:booking OR subject:itinerary OR subject:itinerario OR subject:vuelo OR subject:flight OR subject:boarding OR subject:hotel OR subject:airbnb OR subject:pasaje OR subject:entrada OR subject:confirmación OR subject:confirmation OR subject:check-in)";
  if (!sinceMs) return `newer_than:60d ${terms}`;
  const date = new Date(sinceMs - 2 * 86400000);
  const after = `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  return `after:${after} ${terms}`;
}
