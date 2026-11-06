import {
  CATEGORIES,
  INTERVALS,
  filterByTrack,
  groupReservations,
  normalizeSettings,
  parseMailboxMessage,
  SAMPLE_MESSAGES,
} from "/trips/engine.js";

const SITE = "https://travaglino.me";
const TOKEN_KEY = "travaglino-trips-session";
const LOCAL_KEY = "travaglino-trips-local-v1";
const COPY = {
  es: {
    skip: "Saltar al contenido",
    work: "Trabajo",
    experience: "Experiencia",
    education: "Formación",
    git: "Git",
    trips: "Viajes",
    contact: "Contacto",
    kicker: "07  ·  Viajes",
    title: "Viajes",
    lede: "Cada persona autoriza su Gmail. El servicio lee, en el intervalo que elijas, los correos de reservas y arma vuelos, hospedaje, transporte y planes. Los eventos quedan afuera hasta que los actives.",
    connect: "Conectar Gmail",
    sample: "Ver con datos de muestra",
    googleOff: "Gmail todavía no está configurado en el servidor. Se pueden cargar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y TOKEN_ENCRYPTION_KEY en los secretos de la app. Mientras tanto, los datos de muestra muestran el mismo lector.",
    localBanner: "Estás en la pestaña de travaglino.me con datos de muestra en este navegador. La lectura periódica de Gmail corre en el servicio cuando reader.json apunta a él.",
    demoBanner: "Datos de muestra. No es tu correo. Conectá Gmail para reemplazarlos por tus reservas.",
    privacy: "El permiso es de solo lectura. Se buscan correos que parecen reservas y se guardan solo las categorías activas. Desconectar borra el token y las reservas guardadas.",
    setupTitle: "Qué querés que lea",
    setupLede: "Podés trackear viajes y hospedaje y dejar los eventos apagados. El intervalo es por persona.",
    save: "Guardar y leer",
    scan: "Leer ahora",
    settings: "Perfil",
    close: "Cerrar",
    logout: "Salir",
    disconnect: "Desconectar y borrar reservas",
    upcoming: "Próximos",
    past: "Anteriores",
    empty: "Todavía no hay reservas en las categorías activas.",
    on: "Sí",
    off: "No",
    every: "Revisar el correo cada",
    last: "Última lectura",
    next: "Próxima lectura",
    never: "aún no",
    cancelled: "Cancelada",
    code: "Código",
    party: "Pasajero",
    filterAll: "Todo",
    errors: {
      access_denied: "No se autorizó el acceso a Gmail.",
      google_not_configured: "El servidor todavía no tiene las credenciales de Google.",
      oauth_failed: "No se pudo completar el enlace con Gmail.",
      rate_limited: "Esperá un minuto antes de volver a leer.",
      forbidden: "El navegador bloqueó la solicitud.",
    },
    categories: {
      flight: "Vuelos",
      lodging: "Hospedaje",
      transport: "Transporte",
      plan: "Planes",
      event: "Eventos",
    },
    hints: {
      flight: "Pasajes y conexiones",
      lodging: "Hoteles y alquileres",
      transport: "Tren, micro, auto, traslados",
      plan: "Tours, mesas, actividades",
      event: "Entradas, conciertos, conferencias",
    },
    intervals: {
      15: "15 minutos",
      30: "30 minutos",
      60: "1 hora",
      180: "3 horas",
      360: "6 horas",
      720: "12 horas",
      1440: "24 horas",
    },
    footer: "Solo se conserva lo que el perfil deja activo. El correo completo no se guarda.",
  },
  en: {
    skip: "Skip to content",
    work: "Work",
    experience: "Experience",
    education: "Education",
    git: "Git",
    trips: "Trips",
    contact: "Contact",
    kicker: "07  ·  Trips",
    title: "Trips",
    lede: "Each person authorizes their own Gmail. The service reads reservation mail on the interval they choose and keeps flights, lodging, transport, and plans. Events stay off until enabled.",
    connect: "Connect Gmail",
    sample: "Browse sample data",
    googleOff: "Gmail is not configured on the server yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY as app secrets. Sample data uses the same reader until then.",
    localBanner: "This tab on travaglino.me is showing sample data stored in this browser. Periodic Gmail reading runs on the service once reader.json points at it.",
    demoBanner: "Sample data, not your inbox. Connect Gmail to replace it with your reservations.",
    privacy: "Access is read-only. Only reservation-like messages are searched, and only enabled categories are stored. Disconnecting deletes the token and the saved reservations.",
    setupTitle: "What should be read",
    setupLede: "You can track trips and lodging and leave events off. The interval belongs to each person.",
    save: "Save and read",
    scan: "Read now",
    settings: "Profile",
    close: "Close",
    logout: "Log out",
    disconnect: "Disconnect and delete reservations",
    upcoming: "Upcoming",
    past: "Earlier",
    empty: "No reservations in the active categories yet.",
    on: "On",
    off: "Off",
    every: "Check mail every",
    last: "Last read",
    next: "Next read",
    never: "not yet",
    cancelled: "Cancelled",
    code: "Code",
    party: "Passenger",
    filterAll: "All",
    errors: {
      access_denied: "Gmail access was not authorized.",
      google_not_configured: "The server does not have Google credentials yet.",
      oauth_failed: "Gmail could not be linked.",
      rate_limited: "Wait a minute before reading again.",
      forbidden: "The browser blocked the request.",
    },
    categories: {
      flight: "Flights",
      lodging: "Lodging",
      transport: "Transport",
      plan: "Plans",
      event: "Events",
    },
    hints: {
      flight: "Tickets and connections",
      lodging: "Hotels and rentals",
      transport: "Train, bus, car, transfers",
      plan: "Tours, tables, activities",
      event: "Tickets, concerts, conferences",
    },
    intervals: {
      15: "15 minutes",
      30: "30 minutes",
      60: "1 hour",
      180: "3 hours",
      360: "6 hours",
      720: "12 hours",
      1440: "24 hours",
    },
    footer: "Only categories left on in the profile are kept. The full message is not stored.",
  },
};

const state = {
  mode: "local",
  api: "",
  lang: initialLang(),
  googleConfigured: false,
  viewer: null,
  reservations: [],
  notice: "",
  busy: false,
  filter: "all",
  showSettings: false,
};

const root = document.querySelector("#app");

boot().catch(() => {
  state.notice = "server_error";
  render();
});
setInterval(() => {
  if (state.mode !== "local" || !state.viewer?.setupComplete || !state.viewer.nextScanAt) return;
  if (Date.parse(state.viewer.nextScanAt) <= Date.now()) localScan();
}, 30_000);

async function boot() {
  const params = new URLSearchParams(location.search);
  state.notice = params.get("error") || "";
  if (params.get("error")) history.replaceState(null, "", location.pathname);
  state.api = await readerOrigin();
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = hash.get("code") || "";
  if (code) {
    history.replaceState(null, "", location.pathname);
    if (state.mode !== "local") {
      const exchanged = await api("/api/auth/exchange", { method: "POST", json: { code } });
      state.notice = exchanged.ok ? "" : exchanged.data.error || "oauth_failed";
    }
  }
  if (state.mode === "local") {
    state.viewer = loadLocal();
    if (state.viewer?.setupComplete) state.reservations = state.viewer.reservations || [];
  } else {
    const me = await api("/api/me");
    if (me.data?.service === "trips") {
      state.googleConfigured = Boolean(me.data.googleConfigured);
      state.viewer = me.data.viewer;
      if (state.viewer?.setupComplete) await loadReservations();
    } else {
      state.mode = "local";
      state.api = "";
      state.viewer = loadLocal();
    }
  }
  render();
}

async function readerOrigin() {
  try {
    const response = await fetch("/trips/reader.json", { cache: "no-store" });
    const body = await response.json();
    const api = typeof body.api === "string" ? body.api.replace(/\/$/, "") : "";
    if (api && new URL(api).origin !== location.origin) {
      state.mode = "remote";
      return api;
    }
  } catch {
    /* same-origin reader */
  }
  try {
    const response = await fetch("/api/me", { headers: { "x-trips-request": "1" }, credentials: "include" });
    const body = await response.json();
    if (body?.service === "trips") {
      state.mode = "server";
      state.googleConfigured = Boolean(body.googleConfigured);
      return "";
    }
  } catch {
    /* static tab */
  }
  state.mode = "local";
  return "";
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("x-trips-request", "1");
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body;
  if (options.json) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`${state.api}${path}`, {
    method: options.method || "GET",
    headers,
    body,
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
  return { ok: response.ok, status: response.status, data };
}

function render() {
  const t = COPY[state.lang];
  document.documentElement.lang = state.lang;
  document.title = `${t.title} — Travaglino`;
  root.replaceChildren(header(t), main(t), footer(t));
}

function header(t) {
  const onSite = location.hostname === "travaglino.me" || location.hostname === "www.travaglino.me";
  const href = (path) => (onSite ? path : `${SITE}${path}`);
  return el("header", { class: "site-header" }, [
    el("div", { class: "wrap" }, [
      el("a", { class: "mark", href: href("/") }, [
        el("span", { class: "mark-it" }, ["IT"]),
        el("span", { class: "mark-name" }, ["Travaglino"]),
      ]),
      el("div", { class: "nav-cluster" }, [
        el("nav", { "aria-label": "Primary" }, [
          el("ul", { class: "nav-links" }, [
            item(t.work, href("/#trabajo")),
            item(t.experience, href("/#experiencia")),
            item(t.education, href("/#formacion")),
            item("CV", href("/cv/")),
            item(t.git, href("/github/")),
            item(t.trips, "/trips", true),
            item(t.contact, href("/#contacto")),
          ]),
        ]),
        el("div", { class: "lang-switch", role: "group", "aria-label": "Language" }, [
          langButton("es", "ES"),
          langButton("en", "EN"),
        ]),
      ]),
    ]),
  ]);
}

function main(t) {
  const blocks = [hero(t)];
  if (state.notice) blocks.push(el("p", { class: "notice", role: "status" }, [t.errors[state.notice] || state.notice]));
  if (!state.viewer) blocks.push(gate(t));
  else if (!state.viewer.setupComplete) blocks.push(setup(t));
  else blocks.push(dashboard(t));
  return el("main", { id: "contenido" }, [el("div", { class: "wrap" }, blocks)]);
}

function hero(t) {
  return el("section", { class: "hero" }, [
    el("p", { class: "kicker" }, [t.kicker]),
    el("h1", {}, [t.title]),
    el("p", { class: "lede" }, [t.lede]),
  ]);
}

function gate(t) {
  const connect = state.mode === "local"
    ? el("p", { class: "notice" }, [t.localBanner])
    : state.googleConfigured
      ? el("a", { class: "btn", href: connectHref() }, [t.connect])
      : el("p", { class: "notice" }, [t.googleOff]);
  return el("section", { class: "panel" }, [
    connect,
    el("div", { class: "actions" }, [
      el("button", { class: "btn ghost", type: "button", onclick: enterSample }, [t.sample]),
    ]),
    el("p", { class: "meta" }, [t.privacy]),
  ]);
}

function setup(t) {
  const draft = normalizeSettings(state.viewer);
  return el("section", { class: "grid" }, [
    el("div", { class: "panel" }, [
      el("h2", {}, [t.setupTitle]),
      el("p", { class: "lede" }, [t.setupLede]),
      ...CATEGORIES.map((category) => choiceButton(t, category, draft.track[category])),
    ]),
    el("form", { class: "panel", onsubmit: saveSetup }, [
      el("label", { for: "interval" }, [t.every]),
      el("select", { id: "interval", name: "interval" }, INTERVALS.map((minutes) => el("option", {
        value: String(minutes),
        selected: minutes === draft.scanIntervalMinutes,
      }, [t.intervals[minutes]]))),
      el("div", { class: "actions" }, [
        el("button", { class: "btn", type: "submit", disabled: state.busy }, [t.save]),
      ]),
      state.mode === "local" ? el("p", { class: "notice" }, [t.localBanner]) : state.viewer.demo ? el("p", { class: "notice" }, [t.demoBanner]) : el("p", { class: "meta" }, [t.privacy]),
    ]),
  ]);
}

function dashboard(t) {
  const visible = state.reservations.filter((item) => state.filter === "all" || item.category === state.filter);
  const trips = groupReservations(visible);
  const now = Date.now();
  const upcoming = trips.filter((trip) => !trip.end || Date.parse(trip.end) >= now - 6 * 3600_000);
  const past = trips.filter((trip) => trip.end && Date.parse(trip.end) < now - 6 * 3600_000);
  return el("section", {}, [
    banner(t),
    el("div", { class: "actions" }, [
      el("button", { class: "btn", type: "button", onclick: readNow, disabled: state.busy }, [t.scan]),
      el("button", { class: "btn ghost", type: "button", onclick: () => { state.showSettings = !state.showSettings; render(); } }, [state.showSettings ? t.close : t.settings]),
      el("button", { class: "btn ghost", type: "button", onclick: logout }, [t.logout]),
    ]),
    state.showSettings ? settingsPanel(t) : null,
    el("div", { class: "chips", role: "group" }, [
      chip(t.filterAll, "all"),
      ...CATEGORIES.filter((category) => state.viewer.track[category]).map((category) => chip(t.categories[category], category)),
    ]),
    trips.length === 0 ? el("p", { class: "panel" }, [t.empty]) : null,
    sectionTrips(t.upcoming, upcoming, t),
    sectionTrips(t.past, past, t),
  ]);
}

function banner(t) {
  if (state.mode === "local") return el("p", { class: "notice" }, [t.localBanner]);
  if (state.viewer.demo) return el("p", { class: "notice" }, [t.demoBanner]);
  return el("p", { class: "meta" }, [`${state.viewer.gmailEmail || state.viewer.email} · ${t.last} ${when(state.viewer.lastScanAt, t)} · ${t.next} ${when(state.viewer.nextScanAt, t)}`]);
}

function settingsPanel(t) {
  return el("form", { class: "panel", onsubmit: saveSetup }, [
    ...CATEGORIES.map((category) => choiceButton(t, category, state.viewer.track[category])),
    el("label", { for: "interval-edit" }, [t.every]),
    el("select", { id: "interval-edit", name: "interval" }, INTERVALS.map((minutes) => el("option", {
      value: String(minutes),
      selected: minutes === state.viewer.scanIntervalMinutes,
    }, [t.intervals[minutes]]))),
    el("div", { class: "actions" }, [
      el("button", { class: "btn", type: "submit" }, [t.save]),
      el("button", { class: "btn ghost", type: "button", onclick: disconnect }, [t.disconnect]),
    ]),
  ]);
}

function sectionTrips(title, trips, t) {
  if (trips.length === 0) return null;
  return el("div", {}, [
    el("p", { class: "kicker" }, [title]),
    ...trips.map((trip) => el("article", { class: "trip" }, [
      el("h2", {}, [trip.title]),
      el("p", { class: "meta" }, [when(trip.start, t) + (trip.end ? ` → ${when(trip.end, t)}` : "")]),
      ...trip.items.map((item) => reservation(item, t)),
    ])),
  ]);
}

function choiceButton(t, category, pressed) {
  return el("button", {
    class: "choice",
    type: "button",
    "aria-pressed": String(pressed),
    onclick: () => toggleTrack(category),
  }, [
    el("span", {}, [el("strong", {}, [t.categories[category]]), el("span", {}, [t.hints[category]])]),
    el("em", { class: "switch" }, [pressed ? t.on : t.off]),
  ]);
}

function reservation(item, t) {
  const route = item.origin && item.destination ? `${item.origin} → ${item.destination}` : "";
  const place = !route && item.location && item.location !== item.title ? item.location : "";
  const headline = route && item.title.includes("→")
    ? item.title.split("·").slice(0, -1).join("·").trim() || item.title
    : item.title;
  const bits = [item.provider, item.flightNumber && !headline.includes(item.flightNumber) ? item.flightNumber : "", item.confirmationCode ? `${t.code} ${item.confirmationCode}` : "", item.party ? `${t.party} ${item.party}` : ""].filter(Boolean);
  return el("article", { class: "reservation" }, [
    el("div", { class: "res-top" }, [
      el("span", { class: "tag" }, [item.status === "cancelled" ? t.cancelled : t.categories[item.category] || item.category]),
      el("span", { class: "meta" }, [when(item.startsAt, t)]),
    ]),
    el("h3", { class: item.status === "cancelled" ? "cancelled" : "" }, [headline]),
    route ? el("p", { class: "route" }, [route]) : null,
    place ? el("p", { class: "route" }, [place]) : null,
    bits.length ? el("p", {}, [bits.join(" · ")]) : null,
  ]);
}

function footer(t) {
  return el("footer", { class: "site-footer" }, [el("div", { class: "wrap" }, [el("p", {}, [t.footer])])]);
}

function item(label, href, current) {
  return el("li", {}, [el("a", { href, ...(current ? { "aria-current": "page" } : {}) }, [label])]);
}

function langButton(lang, label) {
  return el("button", {
    type: "button",
    "aria-pressed": String(state.lang === lang),
    onclick: () => {
      state.lang = lang;
      localStorage.setItem("it-lang", lang);
      render();
    },
  }, [label]);
}

function chip(label, value) {
  return el("button", {
    class: "chip",
    type: "button",
    "aria-pressed": String(state.filter === value),
    onclick: () => { state.filter = value; render(); },
  }, [label]);
}

function toggleTrack(category) {
  const next = { ...state.viewer.track, [category]: !state.viewer.track[category] };
  if (!CATEGORIES.some((key) => next[key])) return;
  state.viewer = { ...state.viewer, track: next };
  if (state.filter !== "all" && !next[state.filter]) state.filter = "all";
  render();
}

async function saveSetup(event) {
  event.preventDefault();
  const select = event.currentTarget.querySelector("select");
  const settings = normalizeSettings({
    track: state.viewer.track,
    scanIntervalMinutes: Number(select.value),
  });
  state.busy = true;
  render();
  if (state.mode === "local") {
    state.viewer = { ...state.viewer, ...settings, setupComplete: true, demo: true };
    localScan();
  } else {
    const saved = await api("/api/settings", { method: "PUT", json: { ...settings, setupComplete: true } });
    if (!saved.ok) state.notice = saved.data.error || "forbidden";
    else {
      state.notice = "";
      state.viewer = saved.data.viewer;
      syncFilter();
      await loadReservations();
    }
  }
  state.busy = false;
  state.showSettings = false;
  render();
}

async function enterSample() {
  if (state.mode === "local") {
    state.viewer = {
      ...normalizeSettings({}),
      name: "Invitado de muestra",
      demo: true,
      setupComplete: false,
      gmailConnected: false,
      email: "",
    };
    persistLocal();
    render();
    return;
  }
  const created = await api("/api/auth/demo", { method: "POST", json: {} });
  if (!created.ok) {
    state.notice = created.data.error || "rate_limited";
    render();
    return;
  }
  const me = await api("/api/me");
  state.viewer = me.data.viewer;
  render();
}

async function readNow() {
  state.busy = true;
  render();
  if (state.mode === "local") localScan();
  else {
    const result = await api("/api/scan", { method: "POST", json: {} });
    if (!result.ok) state.notice = result.data.error || "rate_limited";
    else {
      state.notice = "";
      state.viewer = result.data.viewer;
      state.reservations = result.data.reservations || [];
      syncFilter();
    }
  }
  state.busy = false;
  render();
}

async function loadReservations() {
  const result = await api("/api/reservations");
  if (!result.ok) return;
  state.viewer = result.data.viewer || state.viewer;
  state.reservations = result.data.reservations || [];
}

function localScan() {
  const settings = normalizeSettings(state.viewer);
  const reservations = filterByTrack(SAMPLE_MESSAGES.flatMap((message) => parseMailboxMessage(message)), settings.track);
  const now = new Date();
  const next = new Date(now.getTime() + settings.scanIntervalMinutes * 60_000);
  state.viewer = {
    ...state.viewer,
    ...settings,
    demo: true,
    setupComplete: true,
    lastScanAt: now.toISOString(),
    nextScanAt: next.toISOString(),
    lastScanStatus: "ok",
    reservations,
  };
  state.reservations = reservations;
  persistLocal();
}

async function disconnect() {
  if (state.mode === "local") {
    localStorage.removeItem(LOCAL_KEY);
    state.viewer = null;
    state.reservations = [];
    render();
    return;
  }
  const result = await api("/api/auth/disconnect", { method: "POST", json: {} });
  if (result.ok) {
    state.viewer = result.data.viewer;
    state.reservations = [];
    render();
  }
}

async function logout() {
  if (state.mode !== "local") await api("/api/auth/logout", { method: "POST", json: {} });
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LOCAL_KEY);
  state.viewer = null;
  state.reservations = [];
  state.showSettings = false;
  render();
}

function connectHref() {
  const back = `${location.origin}/trips`;
  return `${state.api}/api/auth/google?return=${encodeURIComponent(back)}`;
}

function loadLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return { ...parsed, ...normalizeSettings(parsed), demo: true };
  } catch {
    return null;
  }
}

function persistLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state.viewer));
}

function syncFilter() {
  if (state.filter !== "all" && state.viewer && !state.viewer.track[state.filter]) state.filter = "all";
}

function when(value, t) {
  if (!value) return t.never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.never;
  return new Intl.DateTimeFormat(state.lang === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function initialLang() {
  const stored = localStorage.getItem("it-lang");
  if (stored === "es" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "for") node.htmlFor = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
