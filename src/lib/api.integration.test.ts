import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET = "test-session-secret";
process.env.TOKEN_ENCRYPTION_KEY = "test-token-key";
process.env.CRON_SECRET = "test-cron-secret";

test("preferences, hide, and cron stay on the signed-in profile", async () => {
  const { sql } = await import("./db");
  const { createSessionToken, safeReturnTo } = await import("./session");
  const { PUT } = await import("../app/api/preferences/route");
  const { GET } = await import("../app/api/reservations/route");
  const { DELETE } = await import("../app/api/reservations/[id]/route");
  const { POST } = await import("../app/api/cron/route");
  const { randomUUID } = await import("node:crypto");

  const id = randomUUID();
  const other = randomUUID();
  await sql(
    `insert into profiles (id, email, name, google_sub, gmail_linked) values ($1, $2, $3, $4, false), ($5, $6, $7, $8, false)`,
    [id, "one@example.com", "Uno", "sub-1", other, "two@example.com", "Dos", "sub-2"],
  );
  const token = createSessionToken(id);
  assert.ok(token);
  const reservationId = randomUUID();
  await sql(
    `insert into reservations (id, profile_id, category, title, dedupe_key) values ($1, $2, 'flight', 'Otro', 'k')`,
    [reservationId, other],
  );

  const saved = await PUT(
    new Request("http://127.0.0.1/api/preferences", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, origin: "http://127.0.0.1", "content-type": "application/json" },
      body: JSON.stringify({
        trackFlight: true,
        trackLodging: false,
        trackTransport: true,
        trackPlan: false,
        trackEvent: true,
        syncIntervalMinutes: 15,
        lookbackDays: 30,
        setupComplete: true,
      }),
    }),
  );
  assert.equal(saved.status, 200);
  const profile = (await saved.json()).profile;
  assert.equal(profile.preferences.trackLodging, false);
  assert.equal(profile.preferences.trackEvent, true);
  assert.equal(profile.preferences.syncIntervalMinutes, 15);
  assert.equal(profile.setupComplete, true);

  const list = await GET(new Request("http://127.0.0.1/api/reservations", { headers: { authorization: `Bearer ${token}` } }));
  const body = await list.json();
  assert.equal(body.sample, true);
  assert.equal(body.reservations.some((item: { category: string }) => item.category === "lodging"), false);
  assert.equal(body.reservations.some((item: { category: string }) => item.category === "event"), true);

  const denied = await DELETE(new Request("http://127.0.0.1/api/reservations/" + reservationId, { method: "DELETE", headers: { authorization: `Bearer ${token}`, origin: "http://127.0.0.1" } }), {
    params: Promise.resolve({ id: reservationId }),
  });
  assert.equal(denied.status, 404);
  const still = await sql("select hidden from reservations where id = $1", [reservationId]);
  assert.equal(still[0].hidden, false);

  const blocked = await POST(new Request("http://127.0.0.1/api/cron", { method: "POST", headers: { authorization: "Bearer no" } }));
  assert.equal(blocked.status, 401);
  const cron = await POST(new Request("http://127.0.0.1/api/cron", { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }));
  assert.equal(cron.status, 200);
  const cronBody = await cron.json();
  assert.equal(cronBody.ran, 0);

  const home = new Request("https://trips.example/api/auth/google");
  assert.equal(safeReturnTo("https://evil.example/trips", home), "https://trips.example/");
  assert.equal(safeReturnTo("https://travaglino.me/trips/", home), "https://travaglino.me/trips/");
  assert.equal(safeReturnTo("javascript:alert(1)", home).startsWith("https://trips.example/"), true);
});
