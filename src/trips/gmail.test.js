import assert from "node:assert/strict";
import test from "node:test";
import { buildQuery, decodeBase64Url, extractBodies, gmailToEmail, listMessageIds } from "./gmail.js";

test("search query follows the categories a person enabled", () => {
  const query = buildQuery({
    categories: { flight: true, lodging: true, transport: false, event: false },
    lookbackDays: 90,
  });
  assert.match(query, /FlightReservation/);
  assert.match(query, /LodgingReservation/);
  assert.doesNotMatch(query, /EventReservation/);
  assert.doesNotMatch(query, /RentalCarReservation/);
  assert.match(query, /newer_than:90d/);
});

test("empty category set does not search the mailbox", () => {
  assert.equal(buildQuery({ categories: { flight: false, lodging: false, transport: false, event: false } }), "");
});

test("decodes a Gmail message body", () => {
  const html = "<p>Código de reserva AR8K2P</p>";
  const data = Buffer.from(html, "utf8").toString("base64url");
  const message = {
    id: "m1",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: "Reserva" },
        { name: "From", value: "Aerolíneas <a@example.com>" },
      ],
      parts: [{ mimeType: "text/html", body: { data } }],
    },
  };
  const email = gmailToEmail(message);
  assert.equal(email.subject, "Reserva");
  assert.match(email.html, /AR8K2P/);
  assert.equal(decodeBase64Url(data), html);
  assert.equal(extractBodies(message.payload).html, html);
});

test("lists message ids and stops at the cap", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const page = String(url).includes("pageToken") ? "2" : "1";
    return {
      ok: true,
      json: async () => ({
        messages: [{ id: `id-${page}` }],
        nextPageToken: page === "1" ? "next" : "",
      }),
    };
  };
  const ids = await listMessageIds("token", "subject:vuelo", fetchImpl, 2);
  assert.deepEqual(ids, ["id-1", "id-2"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /gmail\.googleapis\.com/);
  assert.match(calls[1], /pageToken=next/);
});
