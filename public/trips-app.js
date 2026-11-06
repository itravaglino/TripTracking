import { DEFAULT_CATEGORIES, CATEGORY_KEYS, normalizeCategories, normalizeInterval } from "./categories.js";
import { GMAIL_SCOPE, mailboxQuery } from "./mailbox.js";
import { formatWhen, groupTrips, parseMessages } from "./trip-parse.js";
import { SAMPLE_MESSAGES } from "./samples.js";

const STORAGE_KEY = "tt-local-v1";
const COPY = {
  es: {
    kicker: "Viajes",
    title: "Reservas del correo",
    lede: "Cada persona arma su perfil, elige qué seguir y cada cuánto leer Gmail. De ahí salen vuelos, hospedaje, transporte, planes y, si lo pedís, eventos.",
    create: "Crear perfil",
    enter: "Entrar",
    name: "Nombre",
    passphrase: "Frase de acceso",
    passphraseHint: "Ocho caracteres o más. Queda solo en este servidor.",
    track: "Qué seguir",
    every: "Cada cuánto leer",
    minutes: "Minutos",
    flight: "Vuelos",
    flightHint: "Pasajes, códigos de reserva y horarios.",
    lodging: "Hospedaje",
    lodgingHint: "Hoteles, Airbnb y check-in.",
    transport: "Transporte",
    transportHint: "Micros, trenes, remises y alquiler de auto.",
    plan: "Planes",
    planHint: "Restaurantes, tours y actividades.",
    event: "Eventos",
    eventHint: "Shows, conferencias y entradas.",
    save: "Guardar",
    logout: "Salir",
    sync: "Leer ahora",
    sample: "Cargar ejemplo",
    clearSample: "Quitar ejemplo",
    connect: "Vincular Gmail",
    disconnect: "Desvincular Gmail",
    connected: "Gmail vinculado",
    notConnected: "Gmail sin vincular",
    last: "Última lectura",
    next: "Próxima lectura",
    never: "todavía no",
    settings: "Ajustes del perfil",
    deleteOne: "Quitar",
    deleteProfile: "Borrar perfil",
    confirmDelete: "Borrar este perfil y sus reservas?",
    empty: "Todavía no hay reservas en las categorías que elegiste.",
    sampleNote: "Estas filas son un ejemplo, no salieron de tu correo.",
    localNote: "En esta pestaña la lectura corre mientras la página está abierta. Con el servidor de TripTracking también corre con la pestaña cerrada.",
    serverNote: "Este servidor revisa el correo solo, aunque cierres la pestaña.",
    googleMissing: "Falta el cliente OAuth de Google en el servidor. Podés cargar el ejemplo igual.",
    clientId: "Client ID de Google",
    clientHelp: "En Google Cloud, un cliente OAuth de tipo aplicación web. Origen autorizado: https://travaglino.me. Alcance: lectura de Gmail.",
    people: "Perfiles en este navegador",
    addPerson: "Otra persona",
    filterAll: "Todo",
    code: "Código",
    when: "Cuándo",
    route: "Tramo",
    party: "Quién",
    price: "Precio",
    error: {
      invalid_body: "Revisá el nombre, la frase y que haya al menos una categoría. El intervalo va de 15 minutos a 7 días.",
      name_taken: "Ese nombre ya tiene un perfil.",
      bad_login: "El nombre o la frase no coinciden.",
      unauthorized: "Entrá de nuevo.",
      forbidden: "No se pudo guardar.",
      google_not_configured: "El servidor todavía no tiene el cliente de Google.",
      gmail_not_connected: "Primero vinculá Gmail.",
      gmail_unauthorized: "Gmail pidió vincular de nuevo.",
      gmail_failed: "Gmail no respondió. Probá de nuevo en un rato.",
      rate_limited: "Esperá unos segundos antes de leer otra vez.",
      not_found: "Esa reserva ya no está.",
      server_error: "Algo falló del lado del servidor.",
      client_id: "El Client ID tiene que terminar en .apps.googleusercontent.com.",
      gmail_denied: "No se autorizó Gmail.",
      need_one: "Elegí al menos una categoría.",
    },
    docTitle: "Viajes — Ignacio Travaglino",
  },
  en: {
    kicker: "Trips",
    title: "Reservations from mail",
    lede: "Each person sets up a profile, chooses what to track, and how often to read Gmail. Flights, lodging, transport, plans, and events if you ask for them.",
    create: "Create profile",
    enter: "Sign in",
    name: "Name",
    passphrase: "Passphrase",
    passphraseHint: "Eight characters or more. It stays on this server.",
    track: "What to track",
    every: "How often to read",
    minutes: "Minutes",
    flight: "Flights",
    flightHint: "Tickets, record locators, and times.",
    lodging: "Lodging",
    lodgingHint: "Hotels, Airbnb, and check-in.",
    transport: "Transport",
    transportHint: "Buses, trains, rides, and car rental.",
    plan: "Plans",
    planHint: "Restaurants, tours, and activities.",
    event: "Events",
    eventHint: "Shows, conferences, and tickets.",
    save: "Save",
    logout: "Sign out",
    sync: "Read now",
    sample: "Load sample",
    clearSample: "Remove sample",
    connect: "Link Gmail",
    disconnect: "Unlink Gmail",
    connected: "Gmail linked",
    notConnected: "Gmail not linked",
    last: "Last read",
    next: "Next read",
    never: "not yet",
    settings: "Profile settings",
    deleteOne: "Remove",
    deleteProfile: "Delete profile",
    confirmDelete: "Delete this profile and its reservations?",
    empty: "No reservations yet in the categories you chose.",
    sampleNote: "These rows are a sample. They did not come from your mail.",
    localNote: "On this tab, mail is read while the page is open. The TripTracking server also reads it while the tab is closed.",
    serverNote: "This server keeps reading mail after you close the tab.",
    googleMissing: "The server has no Google OAuth client yet. The sample mailbox still works.",
    clientId: "Google client ID",
    clientHelp: "In Google Cloud, a web application OAuth client. Authorized origin: https://travaglino.me. Scope: Gmail readonly.",
    people: "Profiles on this browser",
    addPerson: "Another person",
    filterAll: "All",
    code: "Code",
    when: "When",
    route: "Route",
    party: "Who",
    price: "Price",
    error: {
      invalid_body: "Check the name, the passphrase, and that at least one category is on. The interval is 15 minutes to 7 days.",
      name_taken: "That name already has a profile.",
      bad_login: "The name or passphrase does not match.",
      unauthorized: "Sign in again.",
      forbidden: "Could not save.",
      google_not_configured: "The server does not have a Google client yet.",
      gmail_not_connected: "Link Gmail first.",
      gmail_unauthorized: "Gmail asked to be linked again.",
      gmail_failed: "Gmail did not respond. Try again shortly.",
      rate_limited: "Wait a few seconds before reading again.",
      not_found: "That reservation is already gone.",
      server_error: "Something failed on the server.",
      client_id: "The client ID has to end in .apps.googleusercontent.com.",
      gmail_denied: "Gmail was not authorized.",
      need_one: "Choose at least one category.",
    },
    docTitle: "Trips — Ignacio Travaglino",
  },
};

const tokens = new Map();
let tokenClient = null;

function text(lang) {
  return COPY[lang] || COPY.en;
}

function initialLang() {
  try {
    const stored = localStorage.getItem("it-lang");
    if (stored === "es" || stored === "en") return stored;
  } catch {
    /* private mode */
  }
  return document.documentElement.lang === "es" ? "es" : "en";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function loadLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
    if (!parsed || !Array.isArray(parsed.profiles)) return { profiles: [], activeId: "" };
    return parsed;
  } catch {
    return { profiles: [], activeId: "" };
  }
}

function saveLocal(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function categoriesFrom(form) {
  const categories = {};
  for (const key of CATEGORY_KEYS) {
    categories[key] = Boolean(form.querySelector(`[name="cat-${key}"]`)?.checked);
  }
  return normalizeCategories(categories);
}

function categoryFields(copy, current = DEFAULT_CATEGORIES) {
  return el("fieldset", { class: "choices" }, [
    el("legend", {}, copy.track),
    ...CATEGORY_KEYS.map((key) =>
      el("label", { class: "choice" }, [
        el("input", { type: "checkbox", name: `cat-${key}`, checked: current[key] ? "checked" : null }),
        el("span", {}, [el("strong", {}, copy[key]), el("small", {}, copy[`${key}Hint`])]),
      ]),
    ),
  ]);
}

function intervalField(copy, minutes = 360) {
  const input = el("input", { name: "interval", type: "number", min: "15", max: "10080", value: String(minutes), required: "required" });
  const presets = el(
    "div",
    { class: "presets" },
    [15, 30, 60, 360, 1440].map((value) =>
      el("button", {
        type: "button",
        "aria-pressed": value === Number(minutes) ? "true" : "false",
        onclick: () => {
          input.value = String(value);
          presets.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", button.dataset.min === String(value) ? "true" : "false"));
        },
        "data-min": String(value),
      }, `${value} min`),
    ),
  );
  return el("div", {}, [
    el("label", { class: "field" }, [el("span", {}, copy.minutes), input]),
    presets,
  ]);
}

function stamp(ms, lang, copy) {
  if (!ms) return copy.never;
  return new Date(ms).toLocaleString(lang === "es" ? "es-AR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function decodeBase64Url(data) {
  const normalized = String(data).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function browserMessageText(payload) {
  const chunks = [];
  const walk = (part, mime) => {
    if (!part) return;
    if (part.mimeType === mime && part.body?.data) chunks.push(decodeBase64Url(part.body.data));
    for (const child of part.parts || []) walk(child, mime);
  };
  walk(payload, "text/plain");
  if (!chunks.length) walk(payload, "text/html");
  return chunks.join("\n").slice(0, 20000);
}

export function startTrips(root = document.querySelector("#trips-root")) {
  if (!root) return;
  const apiBase = root.dataset.api || "";
  const serverMode = Boolean(apiBase);
  const state = {
    lang: initialLang(),
    profile: null,
    reservations: [],
    local: loadLocal(),
    error: "",
    notice: "",
    filter: "all",
    busy: false,
    google: false,
    showCreate: false,
  };

  const params = new URLSearchParams(location.search);
  if (params.get("gmail") === "connected") state.notice = "connected";
  if (params.get("gmail") === "error") state.error = "gmail_denied";

  function applyLangButtons() {
    document.querySelectorAll("[data-lang-switch]").forEach((button) => {
      button.setAttribute("aria-pressed", button.getAttribute("data-lang-switch") === state.lang ? "true" : "false");
    });
    document.documentElement.lang = state.lang;
    document.title = text(state.lang).docTitle;
  }

  function setLang(lang) {
    state.lang = lang === "es" ? "es" : "en";
    try {
      localStorage.setItem("it-lang", state.lang);
    } catch {
      /* private mode */
    }
    applyLangButtons();
    document.dispatchEvent(new CustomEvent("it-lang", { detail: { lang: state.lang } }));
    render();
  }

  document.addEventListener("it-lang", (event) => {
    if (!event.detail || event.detail.lang === state.lang) return;
    state.lang = event.detail.lang;
    applyLangButtons();
    render();
  });

  if (document.documentElement.dataset.page !== "trips") {
    document.querySelectorAll("[data-lang-switch]").forEach((button) => {
      button.addEventListener("click", () => setLang(button.getAttribute("data-lang-switch")));
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-trip-client": "1" },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "server_error");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function activeLocal() {
    return state.local.profiles.find((profile) => profile.id === state.local.activeId) || null;
  }

  function rememberLocal() {
    saveLocal(state.local);
  }

  async function refreshServer() {
    const me = await api("/me");
    state.profile = me.profile;
    const rows = await api("/reservations");
    state.reservations = rows.reservations;
    const health = await api("/health");
    state.google = Boolean(health.google);
  }

  async function boot() {
    applyLangButtons();
    if (!serverMode) {
      state.profile = activeLocal();
      state.reservations = state.profile?.reservations || [];
      render();
      return;
    }
    try {
      await refreshServer();
    } catch (error) {
      if (error.message !== "unauthorized") state.error = error.message;
      state.profile = null;
    }
    render();
  }

  function fail(error) {
    state.error = error.message || "server_error";
    state.busy = false;
    render();
  }

  function formValues(form) {
    const categories = categoriesFrom(form);
    const intervalMinutes = normalizeInterval(Number(form.querySelector('[name="interval"]').value));
    return { categories, intervalMinutes };
  }

  async function onCreate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.querySelector('[name="name"]').value.trim();
    const { categories, intervalMinutes } = formValues(form);
    if (!categories || !intervalMinutes || name.length < 1) {
      state.error = categories ? "invalid_body" : "need_one";
      render();
      return;
    }
    state.busy = true;
    state.error = "";
    if (!serverMode) {
      if (state.local.profiles.some((item) => item.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) {
        state.error = "name_taken";
        state.busy = false;
        render();
        return;
      }
      const profile = {
        id: crypto.randomUUID(),
        name,
        categories,
        intervalMinutes,
        gmailEmail: "",
        gmailClientId: "",
        lastSyncAt: null,
        lastSyncError: "",
        reservations: [],
      };
      state.local.profiles.push(profile);
      state.local.activeId = profile.id;
      state.profile = profile;
      state.reservations = [];
      state.showCreate = false;
      rememberLocal();
      state.busy = false;
      render();
      return;
    }
    try {
      const created = await api("/profiles", {
        method: "POST",
        body: { name, passphrase: form.querySelector('[name="passphrase"]').value, categories, intervalMinutes },
      });
      state.profile = created.profile;
      state.reservations = [];
      state.busy = false;
      await refreshServer().catch(() => {});
      render();
    } catch (error) {
      fail(error);
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    state.busy = true;
    state.error = "";
    try {
      const result = await api("/login", {
        method: "POST",
        body: {
          name: event.currentTarget.querySelector('[name="name"]').value.trim(),
          passphrase: event.currentTarget.querySelector('[name="passphrase"]').value,
        },
      });
      state.profile = result.profile;
      await refreshServer();
      state.busy = false;
      render();
    } catch (error) {
      fail(error);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const { categories, intervalMinutes } = formValues(event.currentTarget);
    if (!categories || !intervalMinutes) {
      state.error = "need_one";
      render();
      return;
    }
    state.busy = true;
    if (!serverMode) {
      const profile = activeLocal();
      profile.categories = categories;
      profile.intervalMinutes = intervalMinutes;
      profile.gmailClientId = event.currentTarget.clientId?.value.trim() || profile.gmailClientId;
      profile.reservations = profile.reservations.filter((item) => categories[item.category] !== false);
      state.profile = profile;
      state.reservations = profile.reservations;
      rememberLocal();
      state.busy = false;
      state.error = "";
      render();
      return;
    }
    try {
      const result = await api("/me", { method: "PATCH", body: { categories, intervalMinutes } });
      state.profile = result.profile;
      await refreshServer();
      state.busy = false;
      state.error = "";
      render();
    } catch (error) {
      fail(error);
    }
  }

  async function loadSample() {
    state.busy = true;
    if (!serverMode) {
      const profile = activeLocal();
      const parsed = parseMessages(SAMPLE_MESSAGES, profile.categories).map((item) => ({ ...item, source: "sample" }));
      profile.reservations = profile.reservations.filter((item) => item.source !== "sample").concat(parsed);
      state.reservations = profile.reservations;
      rememberLocal();
      state.busy = false;
      render();
      return;
    }
    try {
      await api("/sync/sample", { method: "POST" });
      await refreshServer();
      state.busy = false;
      render();
    } catch (error) {
      fail(error);
    }
  }

  async function clearSample() {
    if (!serverMode) {
      const profile = activeLocal();
      profile.reservations = profile.reservations.filter((item) => item.source !== "sample");
      state.reservations = profile.reservations;
      rememberLocal();
      render();
      return;
    }
    try {
      await api("/samples", { method: "DELETE" });
      await refreshServer();
      render();
    } catch (error) {
      fail(error);
    }
  }

  async function removeReservation(id) {
    if (!serverMode) {
      const profile = activeLocal();
      profile.reservations = profile.reservations.filter((item) => item.id !== id);
      state.reservations = profile.reservations;
      rememberLocal();
      render();
      return;
    }
    try {
      await api(`/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshServer();
      render();
    } catch (error) {
      fail(error);
    }
  }

  async function pullGmail() {
    const profile = serverMode ? state.profile : activeLocal();
    if (!profile) return;
    if (!serverMode) {
      const token = tokens.get(profile.id);
      if (!token || token.expires < Date.now() + 5000) {
        state.error = "gmail_unauthorized";
        render();
        return;
      }
      state.busy = true;
      const query = encodeURIComponent(mailboxQuery(profile.lastSyncAt || undefined));
      const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${query}`, {
        headers: { authorization: `Bearer ${token.value}` },
      });
      if (!listResponse.ok) {
        state.error = listResponse.status === 401 ? "gmail_unauthorized" : "gmail_failed";
        state.busy = false;
        render();
        return;
      }
      const list = await listResponse.json();
      const messages = [];
      for (const item of list.messages || []) {
        const fullResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, {
          headers: { authorization: `Bearer ${token.value}` },
        });
        if (!fullResponse.ok) continue;
        const full = await fullResponse.json();
        const subject = (full.payload?.headers || []).find((header) => header.name?.toLowerCase() === "subject")?.value || "";
        messages.push({ id: full.id, subject, body: browserMessageText(full.payload) });
      }
      const parsed = parseMessages(messages, profile.categories).map((item) => ({ ...item, source: "gmail", id: `gmail:${item.messageId}` }));
      const kept = profile.reservations.filter((item) => item.source === "sample" || !parsed.some((next) => next.messageId === item.messageId));
      profile.reservations = kept.filter((item) => item.source === "sample").concat(
        profile.reservations.filter((item) => item.source !== "sample" && !parsed.some((next) => next.messageId === item.messageId)),
        parsed,
      );
      profile.lastSyncAt = Date.now();
      profile.lastSyncError = "";
      state.profile = profile;
      state.reservations = profile.reservations;
      rememberLocal();
      state.busy = false;
      state.error = "";
      render();
      return;
    }
    try {
      state.busy = true;
      await api("/sync", { method: "POST" });
      await refreshServer();
      state.busy = false;
      state.error = "";
      render();
    } catch (error) {
      fail(error);
    }
  }

  function connectLocal() {
    const profile = activeLocal();
    const clientId = profile.gmailClientId;
    if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
      state.error = "client_id";
      render();
      return;
    }
    const run = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        callback: async (response) => {
          if (response.error) {
            state.error = "gmail_denied";
            render();
            return;
          }
          tokens.set(profile.id, { value: response.access_token, expires: Date.now() + Number(response.expires_in || 3600) * 1000 });
          const me = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
            headers: { authorization: `Bearer ${response.access_token}` },
          });
          if (me.ok) {
            const data = await me.json();
            profile.gmailEmail = data.emailAddress || "";
          }
          profile.lastSyncError = "";
          rememberLocal();
          await pullGmail();
        },
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    };
    if (window.google?.accounts?.oauth2) {
      run();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = run;
    script.onerror = () => {
      state.error = "gmail_failed";
      render();
    };
    document.head.append(script);
  }

  function disconnect() {
    if (!serverMode) {
      const profile = activeLocal();
      tokens.delete(profile.id);
      profile.gmailEmail = "";
      rememberLocal();
      render();
      return;
    }
    api("/gmail/disconnect", { method: "POST" })
      .then((result) => {
        state.profile = result.profile;
        render();
      })
      .catch(fail);
  }

  async function removeProfile(event) {
    event.preventDefault();
    const copy = text(state.lang);
    if (!window.confirm(copy.confirmDelete)) return;
    if (!serverMode) {
      state.local.profiles = state.local.profiles.filter((profile) => profile.id !== state.local.activeId);
      state.local.activeId = state.local.profiles[0]?.id || "";
      state.profile = activeLocal();
      state.reservations = state.profile?.reservations || [];
      rememberLocal();
      render();
      return;
    }
    try {
      await api("/me", { method: "DELETE", body: { passphrase: event.currentTarget.passphrase.value } });
      state.profile = null;
      state.reservations = [];
      render();
    } catch (error) {
      fail(error);
    }
  }

  function switchProfile(id) {
    state.local.activeId = id;
    state.profile = activeLocal();
    state.reservations = state.profile?.reservations || [];
    state.error = "";
    rememberLocal();
    render();
  }

  function renderAuth(copy) {
    const create = el("form", { class: "panel", onsubmit: onCreate }, [
      el("h2", {}, copy.create),
      el("label", { class: "field" }, [el("span", {}, copy.name), el("input", { name: "name", required: "required", maxlength: "40", autocomplete: "nickname" })]),
      serverMode
        ? el("label", { class: "field" }, [
            el("span", {}, copy.passphrase),
            el("input", { name: "passphrase", type: "password", required: "required", minlength: "8", autocomplete: "new-password" }),
            el("small", {}, copy.passphraseHint),
          ])
        : null,
      categoryFields(copy),
      el("p", { class: "meta" }, copy.every),
      intervalField(copy),
      el("div", { class: "actions" }, [el("button", { class: "btn", type: "submit" }, copy.create)]),
    ]);
    const login = serverMode
      ? el("form", { class: "panel", onsubmit: onLogin }, [
          el("h2", {}, copy.enter),
          el("label", { class: "field" }, [el("span", {}, copy.name), el("input", { name: "name", required: "required", autocomplete: "username" })]),
          el("label", { class: "field" }, [el("span", {}, copy.passphrase), el("input", { name: "passphrase", type: "password", required: "required", minlength: "8", autocomplete: "current-password" })]),
          el("div", { class: "actions" }, [el("button", { class: "btn", type: "submit" }, copy.enter)]),
        ])
      : null;
    return el("div", { class: "trips-layout" }, [create, login]);
  }

  function renderDashboard(copy) {
    const profile = state.profile;
    const visible = state.reservations.filter((item) => state.filter === "all" || item.category === state.filter);
    const trips = groupTrips(visible, state.lang);
    const hasSample = state.reservations.some((item) => item.source === "sample");
    const nextAt = profile.lastSyncAt ? profile.lastSyncAt + profile.intervalMinutes * 60000 : null;
    const linked = serverMode ? profile.gmailConnected : Boolean(profile.gmailEmail && tokens.get(profile.id));
    const settings = el("form", { class: "panel", onsubmit: saveSettings }, [
      el("h2", {}, copy.settings),
      categoryFields(copy, profile.categories),
      el("p", { class: "meta" }, copy.every),
      intervalField(copy, profile.intervalMinutes),
      serverMode
        ? null
        : el("label", { class: "field" }, [
            el("span", {}, copy.clientId),
            el("input", { name: "clientId", value: profile.gmailClientId || "", autocomplete: "off", spellcheck: "false" }),
            el("small", {}, copy.clientHelp),
          ]),
      el("div", { class: "actions" }, [el("button", { class: "btn", type: "submit", disabled: state.busy }, copy.save)]),
    ]);
    const deleteForm = el("form", { class: "panel", onsubmit: removeProfile }, [
      el("h2", {}, copy.deleteProfile),
      serverMode
        ? el("label", { class: "field" }, [el("span", {}, copy.passphrase), el("input", { name: "passphrase", type: "password", required: "required", minlength: "8", autocomplete: "current-password" })])
        : null,
      el("div", { class: "actions" }, [el("button", { class: "btn-ghost", type: "submit" }, copy.deleteProfile)]),
    ]);
    const people = serverMode
      ? null
      : el("div", { class: "profile-switch" }, [
          ...state.local.profiles.map((item) =>
            el("button", { type: "button", "aria-pressed": item.id === profile.id ? "true" : "false", onclick: () => switchProfile(item.id) }, item.name),
          ),
          el("button", { type: "button", onclick: () => { state.showCreate = true; render(); } }, copy.addPerson),
        ]);
    const list = trips.length
      ? el("div", { class: "trip-list" }, trips.map((trip) =>
          el("article", { class: "trip-card" }, [
            el("h3", {}, trip.title),
            ...trip.items.map((item) =>
              el("div", { class: "reservation" }, [
                el("div", {}, [el("div", { class: "tag" }, copy[item.category]), item.source === "sample" ? el("div", { class: "sample-flag" }, copy.sample) : null]),
                el("div", {}, [
                  el("h3", {}, item.title),
                  el("p", { class: "meta" }, [item.startsAt ? `${copy.when}: ${formatWhen(item.startsAt, state.lang)}` : "", item.endsAt ? ` → ${formatWhen(item.endsAt, state.lang)}` : ""].filter(Boolean).join("")),
                  el("p", { class: "meta" }, [item.origin, item.destination].filter(Boolean).join(" → ") || item.place || ""),
                  el("p", { class: "meta" }, [item.confirmationCode ? `${copy.code}: ${item.confirmationCode}` : "", item.party ? `${copy.party}: ${item.party}` : "", item.price ? `${copy.price}: ${item.currency} ${item.price}` : ""].filter(Boolean).join(" · ")),
                ]),
                el("button", { class: "btn-ghost", type: "button", onclick: () => removeReservation(item.id) }, copy.deleteOne),
              ]),
            ),
          ]),
        ))
      : el("p", { class: "empty" }, copy.empty);

    return el("div", { class: "stack" }, [
      people,
      state.showCreate && !serverMode ? renderAuth(copy) : null,
      el("div", { class: "panel" }, [
        el("p", { class: "status-line" }, [
          el("span", {}, linked ? `${copy.connected}${profile.gmailEmail ? `: ${profile.gmailEmail}` : ""}` : copy.notConnected),
          el("span", {}, `${copy.last}: ${stamp(profile.lastSyncAt, state.lang, copy)}`),
          el("span", {}, `${copy.next}: ${stamp(nextAt, state.lang, copy)}`),
        ]),
        el("p", { class: "meta" }, serverMode ? copy.serverNote : copy.localNote),
        serverMode && !state.google ? el("p", { class: "notice" }, copy.googleMissing) : null,
        hasSample ? el("p", { class: "notice" }, copy.sampleNote) : null,
        profile.lastSyncError ? el("p", { class: "error", role: "alert" }, copy.error[profile.lastSyncError] || profile.lastSyncError) : null,
        el("div", { class: "actions" }, [
          serverMode
            ? el("a", { class: "btn", href: `${apiBase}/auth/google` }, copy.connect)
            : el("button", { class: "btn", type: "button", onclick: connectLocal }, copy.connect),
          el("button", { class: "btn-ghost", type: "button", disabled: state.busy || !linked, onclick: pullGmail }, copy.sync),
          linked ? el("button", { class: "btn-ghost", type: "button", onclick: disconnect }, copy.disconnect) : null,
          el("button", { class: "btn-ghost", type: "button", disabled: state.busy, onclick: loadSample }, copy.sample),
          hasSample ? el("button", { class: "btn-ghost", type: "button", onclick: clearSample }, copy.clearSample) : null,
          serverMode ? el("button", { class: "btn-ghost", type: "button", onclick: () => api("/logout", { method: "POST" }).then(() => { state.profile = null; state.reservations = []; render(); }).catch(fail) }, copy.logout) : null,
        ]),
        el("div", { class: "filters" }, [
          el("button", { type: "button", "aria-pressed": state.filter === "all" ? "true" : "false", onclick: () => { state.filter = "all"; render(); } }, copy.filterAll),
          ...CATEGORY_KEYS.filter((key) => profile.categories[key]).map((key) =>
            el("button", { type: "button", "aria-pressed": state.filter === key ? "true" : "false", onclick: () => { state.filter = key; render(); } }, copy[key]),
          ),
        ]),
        list,
      ]),
      el("div", { class: "trips-layout" }, [settings, deleteForm]),
    ]);
  }

  function render() {
    const copy = text(state.lang);
    applyLangButtons();
    root.replaceChildren(
      el("header", { class: "trips-head" }, [
        el("p", { class: "kicker" }, copy.kicker),
        el("h1", { class: "section-title" }, copy.title),
        el("p", { class: "lede" }, copy.lede),
        state.error ? el("p", { class: "error", role: "alert" }, copy.error[state.error] || state.error) : null,
        state.notice === "connected" ? el("p", { class: "notice" }, copy.connected) : null,
      ]),
      state.profile ? renderDashboard(copy) : renderAuth(copy),
    );
  }

  async function maybeLocalSync() {
    if (serverMode || state.busy) return;
    const profile = activeLocal();
    if (!profile?.gmailEmail) return;
    const token = tokens.get(profile.id);
    if (!token) return;
    const due = !profile.lastSyncAt || Date.now() >= profile.lastSyncAt + profile.intervalMinutes * 60000;
    if (!due) return;
    await pullGmail();
  }

  const typing = () => {
    const active = document.activeElement;
    return active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  };
  setInterval(() => {
    if (serverMode && state.profile) {
      refreshServer()
        .then(() => {
          if (!typing()) render();
        })
        .catch(() => {});
      return;
    }
    if (!typing()) maybeLocalSync().catch(() => {});
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeLocalSync().catch(() => {});
  });

  boot();
}

if (document.querySelector("#trips-root")) startTrips();
