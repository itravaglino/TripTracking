import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../server.js";
import { decodeBase64Url } from "./gmail.js";
import { SAMPLE_MESSAGES } from "./samples.js";

function b64url(text) {
  return Buffer.from(text).toString("base64url");
}

function mockFetch() {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
    }
    if (href.endsWith("/profile")) return Response.json({ emailAddress: "person@gmail.com" });
    if (href.includes("/messages?")) return Response.json({ messages: [{ id: "m1" }, { id: "noise" }] });
    if (href.includes("/messages/m1")) {
      return Response.json({
        id: "m1",
        payload: {
          mimeType: "text/plain",
          headers: [{ name: "Subject", value: SAMPLE_MESSAGES[0].subject }],
          body: { data: b64url(SAMPLE_MESSAGES[0].body) },
        },
      });
    }
    if (href.includes("/messages/noise")) {
      return Response.json({
        id: "noise",
        payload: {
          mimeType: "text/plain",
          headers: [{ name: "Subject", value: SAMPLE_MESSAGES[5].subject }],
          body: { data: b64url(SAMPLE_MESSAGES[5].body) },
        },
      });
    }
    return new Response("missing", { status: 404 });
  };
}

function listen(handler) {
  const server = createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function call(base, path, { method = "GET", cookie = "", body, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      "x-trip-client": "1",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

function sessionCookie(headers) {
  return headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .filter((line) => line.startsWith("tt_session="))
    .join("; ");
}

const setup = {
  categories: { flight: true, lodging: true, transport: true, plan: true, event: false },
  intervalMinutes: 360,
};

test("profiles stay separate and ignored categories are not stored", async () => {
  const isolated = createApp({
    env: { APP_SECRET: "test-secret", DATABASE_PATH: ":memory:" },
  });
  const server = await listen(isolated.handler);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await call(base, "/api/profiles", {
      method: "POST",
      body: { name: "Ada", passphrase: "correct horse", ...setup },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.profile.categories.event, false);
    const cookie = sessionCookie(created.headers);
    const sample = await call(base, "/api/sync/sample", { method: "POST", cookie });
    assert.equal(sample.status, 200);
    assert.equal(sample.data.imported, 4);
    const mine = await call(base, "/api/reservations", { cookie });
    assert.equal(mine.data.reservations.some((item) => item.category === "event"), false);
    assert.equal(mine.data.reservations.some((item) => item.category === "flight"), true);

    const other = await call(base, "/api/profiles", {
      method: "POST",
      body: { name: "Nico", passphrase: "another secret", ...setup },
    });
    const otherCookie = sessionCookie(other.headers);
    const theirs = await call(base, "/api/reservations", { cookie: otherCookie });
    assert.deepEqual(theirs.data.reservations, []);
    const otherSample = await call(base, "/api/sync/sample", { method: "POST", cookie: otherCookie });
    assert.equal(otherSample.status, 200);
    const otherRows = await call(base, "/api/reservations", { cookie: otherCookie });
    assert.equal(otherRows.data.reservations.length, 4);
    const stillMine = await call(base, "/api/reservations", { cookie });
    assert.equal(stillMine.data.reservations.length, 4);
    const removed = await call(base, `/api/reservations/${encodeURIComponent(mine.data.reservations[0].id)}`, {
      method: "DELETE",
      cookie: otherCookie,
    });
    assert.equal(removed.status, 404);
    const still = await call(base, "/api/reservations", { cookie });
    assert.equal(still.data.reservations.length, 4);

    const rejected = await call(base, "/api/profiles", {
      method: "POST",
      body: { name: "Ada", passphrase: "correct horse", ...setup, intervalMinutes: 1 },
    });
    assert.equal(rejected.status, 400);
    const noHeader = await call(base, "/api/login", {
      method: "POST",
      body: { name: "Ada", passphrase: "correct horse" },
      headers: { "x-trip-client": "" },
    });
    assert.equal(noHeader.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("gmail sync keeps the flight and drops the invoice", async () => {
  assert.match(decodeBase64Url(b64url("Córdoba")), /Córdoba/);
  const app = createApp({
    env: {
      APP_SECRET: "test-secret",
      DATABASE_PATH: ":memory:",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      PUBLIC_URL: "http://127.0.0.1:8787",
    },
    fetchImpl: mockFetch(),
  });
  const server = await listen(app.handler);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await call(base, "/api/profiles", {
      method: "POST",
      body: { name: "Ada", passphrase: "correct horse", ...setup },
    });
    const cookie = sessionCookie(created.headers);
    const start = await call(base, "/api/auth/google", { cookie });
    assert.equal(start.status, 302);
    assert.match(start.headers.get("location"), /accounts\.google\.com/);
    assert.match(start.headers.get("location"), /gmail\.readonly/);
    const oauth = start.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    const callback = await call(base, "/api/auth/google/callback?code=abc&state=" + new URL(start.headers.get("location")).searchParams.get("state"), {
      cookie: `${cookie}; ${oauth}`,
    });
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get("location"), /gmail=connected/);
    const me = await call(base, "/api/me", { cookie });
    assert.equal(me.data.profile.gmailEmail, "person@gmail.com");
    assert.equal(me.data.profile.gmailConnected, true);
    const synced = await call(base, "/api/sync", { method: "POST", cookie });
    assert.equal(synced.status, 200);
    assert.equal(synced.data.imported, 1);
    const rows = await call(base, "/api/reservations", { cookie });
    assert.equal(rows.data.reservations.length, 1);
    assert.equal(rows.data.reservations[0].category, "flight");
    assert.equal(rows.data.reservations[0].confirmationCode, "ABC123");
    const again = await call(base, "/api/sync", { method: "POST", cookie });
    assert.equal(again.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
