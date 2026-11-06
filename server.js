import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CATEGORIES, normalizeCategories, normalizeInterval } from "./lib/categories.js";
import { openDatabase, reservationFromRow } from "./lib/db.js";
import { mailboxAddress, readMailbox } from "./lib/gmail.js";
import { GMAIL_SCOPE } from "./lib/mailbox.js";
import { parseMessages } from "./lib/parse.js";
import { SAMPLE_MESSAGES } from "./lib/samples.js";
import {
  decryptString,
  encryptString,
  hashPassphrase,
  hashToken,
  newId,
  validName,
  validPassphrase,
  verifyPassphrase,
} from "./lib/secrets.js";

const root = dirname(fileURLToPath(import.meta.url));
const files = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/index.html": ["public/index.html", "text/html; charset=utf-8"],
  "/trips-app.js": ["public/trips-app.js", "text/javascript; charset=utf-8"],
  "/base.css": ["public/base.css", "text/css; charset=utf-8"],
  "/trips.css": ["public/trips.css", "text/css; charset=utf-8"],
  "/trip-parse.js": ["public/trip-parse.js", "text/javascript; charset=utf-8"],
  "/samples.js": ["public/samples.js", "text/javascript; charset=utf-8"],
  "/categories.js": ["public/categories.js", "text/javascript; charset=utf-8"],
  "/mailbox.js": ["public/mailbox.js", "text/javascript; charset=utf-8"],
  "/favicon.svg": ["public/favicon.svg", "image/svg+xml"],
  "/favicon.ico": ["public/favicon.svg", "image/svg+xml"],
};

function appSecret(env) {
  if (env.APP_SECRET) return env.APP_SECRET;
  const file = env.SECRET_FILE || join(root, "data", "app-secret");
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    const created = newId() + newId();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, created, { mode: 0o600 });
    return created;
  }
}

function cookiesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const text = part.trim();
    if (!text) continue;
    const eq = text.indexOf("=");
    if (eq === -1) continue;
    out[text.slice(0, eq)] = decodeURIComponent(text.slice(eq + 1));
  }
  return out;
}

function cookie(name, value, { maxAge, secure }) {
  const bits = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof maxAge === "number") bits.push(`Max-Age=${maxAge}`);
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

function publicBase(req, env) {
  if (env.PUBLIC_URL) return String(env.PUBLIC_URL).replace(/\/$/, "");
  const trust = env.TRUST_PROXY === "1";
  const proto = trust && req.headers["x-forwarded-proto"] ? req.headers["x-forwarded-proto"] : "http";
  const host = trust && req.headers["x-forwarded-host"] ? req.headers["x-forwarded-host"] : req.headers.host;
  return `${proto}://${host}`;
}

function redirectUri(req, env) {
  return `${publicBase(req, env)}/api/auth/google/callback`;
}

function allowOrigin(origin) {
  if (!origin) return false;
  return (
    origin === "https://travaglino.me" ||
    origin === "https://www.travaglino.me" ||
    origin === "https://itravaglino.github.io" ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) {
      const error = new Error("too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("invalid_body");
    error.status = 400;
    throw error;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function publicProfile(row) {
  return {
    id: row.id,
    name: row.name,
    categories: JSON.parse(row.categories),
    intervalMinutes: row.interval_minutes,
    gmailEmail: row.gmail_email || "",
    gmailConnected: Boolean(row.refresh_token),
    lastSyncAt: row.last_sync_at || null,
    lastSyncError: row.last_sync_error || "",
  };
}

function saveParsed(db, profileId, parsed, source) {
  const statement = db.prepare(`
    insert into reservations (
      id, profile_id, message_id, source, category, title, provider, confirmation_code,
      starts_at, ends_at, origin, destination, place, party, price, currency, summary, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(profile_id, message_id) do update set
      category = excluded.category,
      title = excluded.title,
      provider = excluded.provider,
      confirmation_code = excluded.confirmation_code,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      origin = excluded.origin,
      destination = excluded.destination,
      place = excluded.place,
      party = excluded.party,
      price = excluded.price,
      currency = excluded.currency,
      summary = excluded.summary,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);
  const now = Date.now();
  for (const item of parsed) {
    statement.run(
      `${source}:${profileId}:${item.messageId}`,
      profileId,
      item.messageId,
      source,
      item.category,
      item.title,
      item.provider,
      item.confirmationCode,
      item.startsAt,
      item.endsAt,
      item.origin,
      item.destination,
      item.place,
      item.party,
      item.price,
      item.currency,
      item.summary,
      now,
    );
  }
}

export function createApp({ db, env, fetchImpl = fetch } = {}) {
  const database = db || openDatabase(env?.DATABASE_PATH || join(root, "data", "trip.sqlite"));
  const settings = { APP_SECRET: appSecret(env || process.env), ...(env || process.env) };
  const manualAt = new Map();

  function profileFromSession(req) {
    const token = cookiesOf(req).tt_session;
    if (!token) return null;
    return database
      .prepare(
        `select profiles.* from sessions
         join profiles on profiles.id = sessions.profile_id
         where sessions.token_hash = ? and sessions.expires_at > ?`,
      )
      .get(hashToken(token), Date.now());
  }

  function issueSession(res, req, profileId) {
    const token = newId() + newId();
    const expires = Date.now() + 30 * 86400000;
    database.prepare("insert into sessions (token_hash, profile_id, expires_at) values (?, ?, ?)").run(hashToken(token), profileId, expires);
    const secure = publicBase(req, settings).startsWith("https://");
    return cookie("tt_session", token, { maxAge: 30 * 86400, secure });
  }

  async function accessTokenFor(row) {
    if (row.access_token && row.access_expires_at > Date.now() + 60000) {
      return decryptString(row.access_token, settings.APP_SECRET);
    }
    if (!row.refresh_token) {
      const error = new Error("gmail_not_connected");
      error.status = 409;
      throw error;
    }
    if (!settings.GOOGLE_CLIENT_ID || !settings.GOOGLE_CLIENT_SECRET) {
      const error = new Error("google_not_configured");
      error.status = 503;
      throw error;
    }
    const body = new URLSearchParams({
      client_id: settings.GOOGLE_CLIENT_ID,
      client_secret: settings.GOOGLE_CLIENT_SECRET,
      refresh_token: decryptString(row.refresh_token, settings.APP_SECRET),
      grant_type: "refresh_token",
    });
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      database.prepare("update profiles set last_sync_error = ? where id = ?").run("gmail_unauthorized", row.id);
      const error = new Error("gmail_unauthorized");
      error.status = 401;
      throw error;
    }
    const token = await response.json();
    const expires = Date.now() + Number(token.expires_in || 3600) * 1000;
    database
      .prepare("update profiles set access_token = ?, access_expires_at = ? where id = ?")
      .run(encryptString(token.access_token, settings.APP_SECRET), expires, row.id);
    return token.access_token;
  }

  async function syncProfile(row) {
    const accessToken = await accessTokenFor(row);
    const messages = await readMailbox({
      accessToken,
      sinceMs: row.last_sync_at || undefined,
      fetchImpl,
    });
    const categories = JSON.parse(row.categories);
    const parsed = parseMessages(messages, categories);
    saveParsed(database, row.id, parsed, "gmail");
    database.prepare("update profiles set last_sync_at = ?, last_sync_error = ? where id = ?").run(Date.now(), "", row.id);
    return parsed.length;
  }

  async function handler(req, res) {
    const origin = req.headers.origin;
    if (allowOrigin(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("access-control-allow-headers", "content-type, x-trip-client");
      res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("vary", "origin");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET" && files[url.pathname]) {
        const [file, type] = files[url.pathname];
        res.writeHead(200, {
          "content-type": type,
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        });
        res.end(readFileSync(join(root, file)));
        return;
      }

      const secureClient = () => {
        if (req.headers["x-trip-client"] !== "1") {
          const error = new Error("forbidden");
          error.status = 403;
          throw error;
        }
      };

      if (req.method === "GET" && url.pathname === "/api/health") {
        send(res, 200, {
          ok: true,
          google: Boolean(settings.GOOGLE_CLIENT_ID && settings.GOOGLE_CLIENT_SECRET),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/profiles") {
        secureClient();
        const body = await readJson(req);
        const name = String(body.name || "").trim();
        const categories = normalizeCategories(body.categories || DEFAULT_CATEGORIES);
        const interval = normalizeInterval(body.intervalMinutes ?? 360);
        if (!validName(name) || !validPassphrase(body.passphrase) || !categories || !interval) {
          send(res, 400, { error: "invalid_body" });
          return;
        }
        const key = name.toLocaleLowerCase("es");
        if (database.prepare("select id from profiles where name_key = ?").get(key)) {
          send(res, 409, { error: "name_taken" });
          return;
        }
        const pass = hashPassphrase(body.passphrase);
        const id = newId();
        database
          .prepare(
            `insert into profiles (
              id, name, name_key, passphrase_hash, passphrase_salt, categories, interval_minutes, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, name, key, pass.hash, pass.salt, JSON.stringify(categories), interval, Date.now());
        const session = issueSession(res, req, id);
        const row = database.prepare("select * from profiles where id = ?").get(id);
        send(res, 201, { profile: publicProfile(row) }, { "set-cookie": session });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/login") {
        secureClient();
        const body = await readJson(req);
        const key = String(body.name || "").trim().toLocaleLowerCase("es");
        const row = key ? database.prepare("select * from profiles where name_key = ?").get(key) : null;
        if (!row || !verifyPassphrase(body.passphrase || "", row.passphrase_salt, row.passphrase_hash)) {
          send(res, 401, { error: "bad_login" });
          return;
        }
        const session = issueSession(res, req, row.id);
        send(res, 200, { profile: publicProfile(row) }, { "set-cookie": session });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/logout") {
        secureClient();
        const token = cookiesOf(req).tt_session;
        if (token) database.prepare("delete from sessions where token_hash = ?").run(hashToken(token));
        const secure = publicBase(req, settings).startsWith("https://");
        send(res, 200, { ok: true }, { "set-cookie": cookie("tt_session", "", { maxAge: 0, secure }) });
        return;
      }

      const profile = profileFromSession(req);
      const requireProfile = () => {
        if (!profile) {
          const error = new Error("unauthorized");
          error.status = 401;
          throw error;
        }
        return profile;
      };

      if (req.method === "GET" && url.pathname === "/api/me") {
        if (!profile) {
          send(res, 401, { error: "unauthorized" });
          return;
        }
        send(res, 200, { profile: publicProfile(profile) });
        return;
      }

      if (req.method === "PATCH" && url.pathname === "/api/me") {
        secureClient();
        const row = requireProfile();
        const body = await readJson(req);
        const categories = body.categories ? normalizeCategories(body.categories) : JSON.parse(row.categories);
        const interval = body.intervalMinutes == null ? row.interval_minutes : normalizeInterval(body.intervalMinutes);
        if (!categories || !interval) {
          send(res, 400, { error: "invalid_body" });
          return;
        }
        database
          .prepare("update profiles set categories = ?, interval_minutes = ? where id = ?")
          .run(JSON.stringify(categories), interval, row.id);
        send(res, 200, { profile: publicProfile(database.prepare("select * from profiles where id = ?").get(row.id)) });
        return;
      }

      if (req.method === "DELETE" && url.pathname === "/api/me") {
        secureClient();
        const row = requireProfile();
        const body = await readJson(req);
        if (!verifyPassphrase(body.passphrase || "", row.passphrase_salt, row.passphrase_hash)) {
          send(res, 401, { error: "bad_login" });
          return;
        }
        database.exec("begin");
        database.prepare("delete from reservations where profile_id = ?").run(row.id);
        database.prepare("delete from sessions where profile_id = ?").run(row.id);
        database.prepare("delete from profiles where id = ?").run(row.id);
        database.exec("commit");
        const secure = publicBase(req, settings).startsWith("https://");
        send(res, 200, { ok: true }, { "set-cookie": cookie("tt_session", "", { maxAge: 0, secure }) });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/auth/google") {
        const row = requireProfile();
        if (!settings.GOOGLE_CLIENT_ID || !settings.GOOGLE_CLIENT_SECRET) {
          send(res, 503, { error: "google_not_configured" });
          return;
        }
        const state = newId();
        const secure = publicBase(req, settings).startsWith("https://");
        const params = new URLSearchParams({
          client_id: settings.GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri(req, settings),
          response_type: "code",
          scope: GMAIL_SCOPE,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state,
        });
        res.writeHead(302, {
          location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
          "set-cookie": [
            cookie("tt_oauth_state", state, { maxAge: 600, secure }),
            cookie("tt_oauth_profile", row.id, { maxAge: 600, secure }),
          ],
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        });
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/auth/google/callback") {
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const saved = cookiesOf(req);
        const secure = publicBase(req, settings).startsWith("https://");
        const clear = [
          cookie("tt_oauth_state", "", { maxAge: 0, secure }),
          cookie("tt_oauth_profile", "", { maxAge: 0, secure }),
        ];
        if (!code || !state || state !== saved.tt_oauth_state || !saved.tt_oauth_profile) {
          res.writeHead(302, { location: "/?gmail=error", "set-cookie": clear });
          res.end();
          return;
        }
        const response = await fetchImpl("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: settings.GOOGLE_CLIENT_ID,
            client_secret: settings.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri(req, settings),
            grant_type: "authorization_code",
          }),
        });
        if (!response.ok) {
          res.writeHead(302, { location: "/?gmail=error", "set-cookie": clear });
          res.end();
          return;
        }
        const token = await response.json();
        const email = await mailboxAddress(token.access_token, fetchImpl);
        const current = database.prepare("select refresh_token from profiles where id = ?").get(saved.tt_oauth_profile);
        const refresh = token.refresh_token
          ? encryptString(token.refresh_token, settings.APP_SECRET)
          : current?.refresh_token || "";
        database
          .prepare(
            `update profiles set gmail_email = ?, refresh_token = ?, access_token = ?, access_expires_at = ?, last_sync_error = ?
             where id = ?`,
          )
          .run(
            email,
            refresh,
            encryptString(token.access_token, settings.APP_SECRET),
            Date.now() + Number(token.expires_in || 3600) * 1000,
            "",
            saved.tt_oauth_profile,
          );
        res.writeHead(302, { location: "/?gmail=connected", "set-cookie": clear });
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/gmail/disconnect") {
        secureClient();
        const row = requireProfile();
        database
          .prepare(
            `update profiles set gmail_email = '', refresh_token = '', access_token = '', access_expires_at = 0 where id = ?`,
          )
          .run(row.id);
        send(res, 200, { profile: publicProfile(database.prepare("select * from profiles where id = ?").get(row.id)) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/sync") {
        secureClient();
        const row = requireProfile();
        const previous = manualAt.get(row.id) || 0;
        if (Date.now() - previous < 20000) {
          send(res, 429, { error: "rate_limited" });
          return;
        }
        manualAt.set(row.id, Date.now());
        const count = await syncProfile(database.prepare("select * from profiles where id = ?").get(row.id));
        send(res, 200, {
          imported: count,
          profile: publicProfile(database.prepare("select * from profiles where id = ?").get(row.id)),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/sync/sample") {
        secureClient();
        const row = requireProfile();
        const parsed = parseMessages(SAMPLE_MESSAGES, JSON.parse(row.categories)).map((item) => ({
          ...item,
          messageId: item.messageId,
        }));
        database.prepare("delete from reservations where profile_id = ? and source = 'sample'").run(row.id);
        saveParsed(database, row.id, parsed, "sample");
        send(res, 200, { imported: parsed.length });
        return;
      }

      if (req.method === "DELETE" && url.pathname === "/api/samples") {
        secureClient();
        const row = requireProfile();
        database.prepare("delete from reservations where profile_id = ? and source = 'sample'").run(row.id);
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/reservations") {
        const row = requireProfile();
        const reservations = database
          .prepare(
            `select * from reservations where profile_id = ? order by starts_at = '', starts_at, title`,
          )
          .all(row.id)
          .map(reservationFromRow);
        send(res, 200, { reservations });
        return;
      }

      const reservationMatch = url.pathname.match(/^\/api\/reservations\/([^/]+)$/);
      if (req.method === "DELETE" && reservationMatch) {
        secureClient();
        const row = requireProfile();
        const id = decodeURIComponent(reservationMatch[1]);
        const result = database.prepare("delete from reservations where id = ? and profile_id = ?").run(id, row.id);
        if (!result.changes) {
          send(res, 404, { error: "not_found" });
          return;
        }
        send(res, 200, { ok: true });
        return;
      }

      send(res, 404, { error: "not_found" });
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error(error);
      const code = status === 500 ? "server_error" : error.message || "server_error";
      if (String(error.message || "").startsWith("gmail_")) {
        const row = profileFromSession(req);
        if (row) database.prepare("update profiles set last_sync_error = ? where id = ?").run(error.message, row.id);
      }
      send(res, status, { error: code });
    }
  }

  async function tick() {
    const due = database
      .prepare(
        `select * from profiles
         where refresh_token != ''
           and (last_sync_at is null or last_sync_at + (interval_minutes * 60000) <= ?)
         limit 5`,
      )
      .all(Date.now());
    for (const row of due) {
      const wait = row.interval_minutes * 60000;
      if (row.last_sync_at && Date.now() - row.last_sync_at < wait) continue;
      try {
        await syncProfile(row);
      } catch (error) {
        const message = /gmail_/.test(error.message || "") ? error.message : "gmail_failed";
        database.prepare("update profiles set last_sync_error = ? where id = ?").run(message, row.id);
      }
    }
  }

  return { handler, tick, db: database };
}

export function start({ env = process.env, fetchImpl = fetch } = {}) {
  const app = createApp({ env, fetchImpl });
  const port = Number(env.PORT || 8787);
  const server = createServer((req, res) => {
    app.handler(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: "server_error" });
    });
  });
  const timer = setInterval(() => {
    app.tick().catch(() => {});
  }, 30000);
  timer.unref?.();
  server.listen(port, "0.0.0.0");
  return server;
}

const executed = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (executed) start();
