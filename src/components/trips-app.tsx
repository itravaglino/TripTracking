"use client";

import { useEffect, useMemo, useState } from "react";
import { INTERVAL_OPTIONS, LOOKBACK_OPTIONS, type Category, type Preferences } from "@/lib/categories";

type Reservation = {
  id: string;
  category: Category;
  title: string;
  provider: string | null;
  confirmationCode: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  origin: string | null;
  destination: string | null;
  location: string | null;
  details: Record<string, string>;
  sourceSubject: string | null;
  sample?: boolean;
};

type Profile = {
  email: string;
  name: string;
  gmailLinked: boolean;
  setupComplete: boolean;
  preferences: Preferences;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
};

type Me = {
  authenticated: boolean;
  googleConfigured: boolean;
  profile?: Profile;
};

const COPY = {
  es: {
    nav: { work: "Trabajo", experience: "Experiencia", education: "Formación", cv: "CV", game: "Git", trips: "Viajes", contact: "Contacto" },
    kicker: "Viajes  ·  reservas",
    title: "Viajes",
    lede: "Conectás Gmail con tu autorización y, cada tanto, se leen solo los correos de reservas. Elegís qué guardar: vuelos, hospedaje, transporte, planes y, si querés, eventos.",
    sample: "Datos de ejemplo",
    sampleBody: "Todavía no hay una cuenta de Gmail vinculada. Estas tarjetas muestran cómo se ve una reserva leída del correo.",
    connect: "Vincular Gmail",
    disconnect: "Desvincular",
    sync: "Leer ahora",
    save: "Guardar perfil",
    hide: "Ocultar",
    readonly: "El acceso es de solo lectura. No se envían, borran ni reenvían correos.",
    needGoogle: "Para vincular Gmail hace falta un cliente OAuth de Google y las claves del servicio. Hasta entonces podés ver el ejemplo.",
    account: "Cuenta",
    what: "Qué leer",
    when: "Cada cuánto",
    lookback: "Desde cuándo",
    upcoming: "Próximo",
    past: "Anteriores",
    empty: "No hay reservas en las categorías que elegiste.",
    last: "Última lectura",
    never: "todavía no",
    categories: {
      flight: "Vuelos",
      lodging: "Hospedaje",
      transport: "Transporte",
      plan: "Planes",
      event: "Eventos",
    } as Record<Category, string>,
    hints: {
      flight: "Pasajes y tarjetas de embarque.",
      lodging: "Hoteles, departamentos y hostales.",
      transport: "Trenes, micros, autos y traslados.",
      plan: "Tours, actividades y mesas.",
      event: "Conciertos, conferencias y entradas.",
    } as Record<Category, string>,
    intervals: { 15: "15 minutos", 60: "1 hora", 180: "3 horas", 360: "6 horas", 720: "12 horas", 1440: "1 día", 10080: "7 días" } as Record<number, string>,
    days: { 30: "30 días", 90: "90 días", 180: "6 meses", 365: "1 año" } as Record<number, string>,
    errors: {
      google_not_configured: "Gmail no está configurado en el servidor.",
      encryption_key: "Falta la clave para guardar el acceso a Gmail.",
      session_secret: "Falta la clave de sesión.",
      oauth_denied: "No se autorizó el acceso a Gmail.",
      oauth_state: "La autorización venció. Probá de nuevo.",
      oauth_exchange: "Google no completó la vinculación.",
      oauth_identity: "No se pudo leer la cuenta de Google.",
      rate_limited: "Esperá un minuto para volver a leer.",
      sync_in_progress: "Ya hay una lectura en curso.",
      gmail_not_linked: "Primero vinculá Gmail.",
      unauthorized: "La sesión de Gmail venció. Vinculá de nuevo.",
      refresh_failed: "La sesión de Gmail venció. Vinculá de nuevo.",
    } as Record<string, string>,
  },
  en: {
    nav: { work: "Work", experience: "Experience", education: "Education", cv: "CV", game: "Git", trips: "Trips", contact: "Contact" },
    kicker: "Trips  ·  reservations",
    title: "Trips",
    lede: "You authorize Gmail, and every so often only reservation mail is read. You choose what to keep: flights, lodging, transport, plans, and events if you want them.",
    sample: "Sample data",
    sampleBody: "No Gmail account is linked yet. These cards show how a reservation read from mail looks.",
    connect: "Link Gmail",
    disconnect: "Unlink",
    sync: "Read now",
    save: "Save profile",
    hide: "Hide",
    readonly: "Access is read-only. Mail is never sent, deleted, or forwarded.",
    needGoogle: "Linking Gmail needs a Google OAuth client and the service keys. Until then you can review the sample.",
    account: "Account",
    what: "What to read",
    when: "How often",
    lookback: "How far back",
    upcoming: "Upcoming",
    past: "Earlier",
    empty: "No reservations in the categories you chose.",
    last: "Last read",
    never: "not yet",
    categories: { flight: "Flights", lodging: "Lodging", transport: "Transport", plan: "Plans", event: "Events" } as Record<Category, string>,
    hints: {
      flight: "Tickets and boarding passes.",
      lodging: "Hotels, apartments, and hostels.",
      transport: "Trains, buses, cars, and transfers.",
      plan: "Tours, activities, and tables.",
      event: "Concerts, conferences, and tickets.",
    } as Record<Category, string>,
    intervals: { 15: "15 minutes", 60: "1 hour", 180: "3 hours", 360: "6 hours", 720: "12 hours", 1440: "1 day", 10080: "7 days" } as Record<number, string>,
    days: { 30: "30 days", 90: "90 days", 180: "6 months", 365: "1 year" } as Record<number, string>,
    errors: {
      google_not_configured: "Gmail is not configured on the server.",
      encryption_key: "The key that stores Gmail access is missing.",
      session_secret: "The session key is missing.",
      oauth_denied: "Gmail access was not authorized.",
      oauth_state: "The authorization expired. Try again.",
      oauth_exchange: "Google did not finish linking.",
      oauth_identity: "The Google account could not be read.",
      rate_limited: "Wait a minute before reading again.",
      sync_in_progress: "A read is already running.",
      gmail_not_linked: "Link Gmail first.",
      unauthorized: "The Gmail session expired. Link it again.",
      refresh_failed: "The Gmail session expired. Link it again.",
    } as Record<string, string>,
  },
};

const DEFAULT_PREFS: Preferences = {
  trackFlight: true,
  trackLodging: true,
  trackTransport: true,
  trackPlan: true,
  trackEvent: false,
  syncIntervalMinutes: 360,
  lookbackDays: 180,
};

const SITE = "https://travaglino.me";

function readDraft(): Preferences | null {
  try {
    const raw = localStorage.getItem("it-trips-prefs");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Preferences;
    if (typeof parsed.syncIntervalMinutes !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = sessionStorage.getItem("tt_session");
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function api(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const auth = authHeaders();
  if ("authorization" in auth && auth.authorization) headers.set("authorization", auth.authorization);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export function TripsApp({ initialError }: { initialError?: string }) {
  const [lang, setLang] = useState<"es" | "en">("en");
  const [me, setMe] = useState<Me | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sample, setSample] = useState(true);
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  const copy = COPY[lang];

  useEffect(() => {
    const stored = localStorage.getItem("it-lang");
    if (stored === "es" || stored === "en") setLang(stored);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const session = hash.get("session");
    if (session) {
      sessionStorage.setItem("tt_session", session);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const meResponse = await api("/api/me");
      if (cancel) return;
      const next = meResponse.data as Me;
      setMe(next);
      if (next.profile) {
        setPrefs(next.profile.preferences);
        if (!next.profile.setupComplete) {
          const draft = readDraft();
          if (draft) {
            setPrefs(draft);
            await api("/api/preferences", { method: "PUT", body: JSON.stringify({ ...draft, setupComplete: false }) });
          }
        }
      } else {
        const draft = readDraft();
        if (draft) setPrefs(draft);
      }
      const list = await api("/api/reservations");
      if (cancel) return;
      setSample(Boolean(list.data.sample));
      setReservations((list.data.reservations ?? []) as Reservation[]);
      if (next.authenticated && next.profile?.gmailLinked && next.profile.setupComplete) {
        const sync = await api("/api/sync", { method: "POST", body: JSON.stringify({ manual: false }) });
        if (sync.data && sync.data.skipped !== true && sync.ok) {
          const again = await api("/api/reservations");
          if (!cancel) {
            setSample(Boolean(again.data.sample));
            setReservations((again.data.reservations ?? []) as Reservation[]);
          }
          const refreshed = await api("/api/me");
          if (!cancel) setMe(refreshed.data as Me);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const visible = useMemo(() => {
    return reservations.filter((item) => {
      if (item.category === "flight") return prefs.trackFlight;
      if (item.category === "lodging") return prefs.trackLodging;
      if (item.category === "transport") return prefs.trackTransport;
      if (item.category === "plan") return prefs.trackPlan;
      return prefs.trackEvent;
    });
  }, [reservations, prefs]);

  const now = Date.now();
  const upcoming = visible.filter((item) => !item.startsAt || new Date(item.startsAt).getTime() >= now - 6 * 3600_000);
  const past = visible.filter((item) => item.startsAt && new Date(item.startsAt).getTime() < now - 6 * 3600_000);

  function updatePrefs(next: Preferences) {
    setPrefs(next);
    if (!me?.profile?.gmailLinked) localStorage.setItem("it-trips-prefs", JSON.stringify(next));
  }

  function chooseLang(next: "es" | "en") {
    setLang(next);
    localStorage.setItem("it-lang", next);
  }

  async function save(setupComplete: boolean) {
    setBusy(true);
    setError("");
    const response = await api("/api/preferences", {
      method: "PUT",
      body: JSON.stringify({ ...prefs, setupComplete }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(copy.errors[response.data.error] ?? copy.errors.oauth_exchange);
      return;
    }
    if (response.data.profile) {
      setMe((current) => (current ? { ...current, profile: response.data.profile } : current));
      setPrefs(response.data.profile.preferences);
    }
    if (setupComplete && me?.profile?.gmailLinked) {
      await readNow();
    }
  }

  async function readNow() {
    setBusy(true);
    setError("");
    const response = await api("/api/sync", { method: "POST", body: JSON.stringify({ manual: true }) });
    if (!response.ok) setError(copy.errors[response.data.error] ?? copy.errors.oauth_exchange);
    const list = await api("/api/reservations");
    setSample(Boolean(list.data.sample));
    setReservations((list.data.reservations ?? []) as Reservation[]);
    const refreshed = await api("/api/me");
    setMe(refreshed.data as Me);
    setBusy(false);
  }

  async function hide(id: string) {
    if (id.startsWith("sample-")) {
      setReservations((current) => current.filter((item) => item.id !== id));
      return;
    }
    const response = await api(`/api/reservations/${id}`, { method: "DELETE" });
    if (response.ok) setReservations((current) => current.filter((item) => item.id !== id));
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("tt_session");
    location.reload();
  }

  const profile = me?.profile;
  const linked = Boolean(profile?.gmailLinked);

  return (
    <>
      <a className="skip-link" href="#contenido">{lang === "es" ? "Saltar al contenido" : "Skip to content"}</a>
      <header className="site-header">
        <div className="wrap">
          <a className="mark" href={SITE}>
            <span className="mark-it">IT</span>
            <span className="mark-name">Travaglino</span>
          </a>
          <div className="nav-cluster">
            <nav aria-label={lang === "es" ? "Principal" : "Primary"}>
              <ul className="nav-links">
                <li><a href={`${SITE}/#trabajo`}>{copy.nav.work}</a></li>
                <li><a href={`${SITE}/#experiencia`}>{copy.nav.experience}</a></li>
                <li><a href={`${SITE}/#formacion`}>{copy.nav.education}</a></li>
                <li><a href={`${SITE}/cv/`}>{copy.nav.cv}</a></li>
                <li><a href={`${SITE}/github/`}>{copy.nav.game}</a></li>
                <li><a href="/" aria-current="page">{copy.nav.trips}</a></li>
                <li><a href={`${SITE}/#contacto`}>{copy.nav.contact}</a></li>
              </ul>
            </nav>
            <div className="lang-switch" role="group" aria-label={lang === "es" ? "Idioma" : "Language"}>
              <button type="button" aria-pressed={lang === "es"} onClick={() => chooseLang("es")}>ES</button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => chooseLang("en")}>EN</button>
            </div>
          </div>
        </div>
      </header>
      <main id="contenido">
        <div className="wrap">
          <p className="kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p className="lede">{copy.lede}</p>
          {error ? <p className="banner" role="alert">{copy.errors[error] ?? error}</p> : null}
          {sample ? (
            <div className="notice">
              <strong>{copy.sample}</strong>
              <p>{copy.sampleBody}</p>
            </div>
          ) : null}
          <div className="grid">
            <section className="panel" aria-labelledby="setup-title">
              <h2 id="setup-title">{profile?.setupComplete ? copy.account : copy.what}</h2>
              {linked ? (
                <p className="account">{profile?.name ? `${profile.name} · ` : ""}{profile?.email}</p>
              ) : (
                <p className="lede" style={{ marginTop: 0 }}>{copy.readonly}</p>
              )}
              {(["flight", "lodging", "transport", "plan", "event"] as Category[]).map((category) => {
                const key = ({
                  flight: "trackFlight",
                  lodging: "trackLodging",
                  transport: "trackTransport",
                  plan: "trackPlan",
                  event: "trackEvent",
                } as const)[category];
                return (
                  <label className="choice" key={category}>
                    <input
                      type="checkbox"
                      checked={prefs[key]}
                      onChange={(event) => updatePrefs({ ...prefs, [key]: event.target.checked })}
                    />
                    <span>
                      {copy.categories[category]}
                      <small>{copy.hints[category]}</small>
                    </span>
                  </label>
                );
              })}
              <label className="field">
                {copy.when}
                <select
                  value={prefs.syncIntervalMinutes}
                  onChange={(event) => updatePrefs({ ...prefs, syncIntervalMinutes: Number(event.target.value) })}
                >
                  {INTERVAL_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>{copy.intervals[minutes]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {copy.lookback}
                <select
                  value={prefs.lookbackDays}
                  onChange={(event) => updatePrefs({ ...prefs, lookbackDays: Number(event.target.value) })}
                >
                  {LOOKBACK_OPTIONS.map((days) => (
                    <option key={days} value={days}>{copy.days[days]}</option>
                  ))}
                </select>
              </label>
              <div className="actions">
                {linked ? (
                  <button className="action primary" type="button" disabled={busy} onClick={() => save(true)}>{copy.save}</button>
                ) : (
                  <a className="action primary" href={me?.googleConfigured ? "/api/auth/google" : undefined} aria-disabled={!me?.googleConfigured} onClick={(event) => { if (!me?.googleConfigured) event.preventDefault(); }}>
                    {copy.connect}
                  </a>
                )}
                {linked ? <button className="action" type="button" disabled={busy} onClick={readNow}>{copy.sync}</button> : null}
                {linked ? <button className="action" type="button" onClick={logout}>{copy.disconnect}</button> : null}
              </div>
              {!me?.googleConfigured && me ? <p className="meta">{copy.needGoogle}</p> : null}
              {linked ? (
                <p className="meta">
                  {copy.last}: {profile?.lastSyncAt ? new Date(profile.lastSyncAt).toLocaleString(lang === "es" ? "es-AR" : "en-US", { timeZone: "America/Argentina/Buenos_Aires" }) : copy.never}
                  {profile?.lastSyncError ? ` · ${copy.errors[profile.lastSyncError] ?? profile.lastSyncError}` : ""}
                </p>
              ) : null}
            </section>
            <section className="panel" aria-labelledby="list-title">
              <h2 id="list-title">{copy.upcoming}</h2>
              <ReservationList items={upcoming} copy={copy} lang={lang} onHide={hide} sample={sample} />
              {past.length > 0 ? (
                <>
                  <h2>{copy.past}</h2>
                  <ReservationList items={past} copy={copy} lang={lang} onHide={hide} sample={sample} />
                </>
              ) : null}
              {visible.length === 0 ? <p className="lede">{copy.empty}</p> : null}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function ReservationList({
  items,
  copy,
  lang,
  onHide,
  sample,
}: {
  items: Reservation[];
  copy: (typeof COPY)["es"];
  lang: "es" | "en";
  onHide: (id: string) => void;
  sample: boolean;
}) {
  return (
    <div className="cards">
      {items.map((item) => (
        <article className="card" key={item.id}>
          <div>
            <div className="tag">{copy.categories[item.category]}</div>
            <p className="meta">{formatWhen(item.startsAt, lang)}</p>
          </div>
          <div>
            <h3 className={item.status === "cancelled" ? "status-cancelled" : undefined}>{item.title}</h3>
            <p>
              {[item.provider, item.confirmationCode, item.location, route(item)].filter(Boolean).join(" · ")}
            </p>
            {item.endsAt ? <p className="meta">{formatWhen(item.endsAt, lang)}</p> : null}
            {!sample && !item.sample ? (
              <button className="action" type="button" onClick={() => onHide(item.id)}>{copy.hide}</button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function route(item: Reservation): string | null {
  if (item.origin && item.destination) return `${item.origin} → ${item.destination}`;
  return null;
}

function formatWhen(value: string | null, lang: "es" | "en"): string {
  if (!value) return "";
  const local = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (local) {
    const [year, month, day] = local[1].split("-");
    return lang === "es" ? `${day}/${month}/${year} ${local[2]}` : `${month}/${day}/${year} ${local[2]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(lang === "es" ? "es-AR" : "en-US", { timeZone: "America/Argentina/Buenos_Aires" });
}
