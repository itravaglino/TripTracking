import { copy, getLang } from "./copy.js";
import { DEMO_MESSAGES } from "./demo-inbox.js";
import { GMAIL_SCOPE } from "./gmail.js";
import { getProfile } from "./gmail.js";
import { groupReservations } from "./group.js";
import { parseEmail } from "./parse.js";
import { INTERVAL_PRESETS, isDue, msUntilNext } from "./schedule.js";
import { readMailbox } from "./sync.js";
import {
  CATEGORIES,
  createProfile,
  loadClientId,
  loadState,
  saveClientId,
  saveState,
  saveToken,
  tokenFor,
  upsertReservations,
  visibleReservations,
} from "./store.js";

const CATEGORY_ORDER = CATEGORIES;

export function startTrips(doc = document) {
  const root = doc.getElementById("trips-root");
  if (!root) return;
  const app = createApp(doc, root);
  app.render();
  app.bindChrome();
  app.arm();
}

function createApp(doc, root) {
  const persistent = localStorage;
  const session = sessionStorage;
  let lang = getLang();
  let state = loadState(persistent);
  let view = state.profiles.length ? "dashboard" : "wizard";
  let wizard = freshDraft();
  let notice = "";
  let busy = false;
  let timer = 0;

  function t() {
    return copy[lang] || copy.en;
  }

  function persist() {
    saveState(persistent, state);
  }

  function active() {
    return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0] || null;
  }

  function render() {
    applyChrome(doc, t(), lang);
    root.replaceChildren(view === "wizard" ? renderWizard() : renderDashboard());
  }

  function renderWizard() {
    const text = t();
    const steps = [text.stepName, text.stepTrack, text.stepPace, text.stepLink];
    return el("section", { class: "trip-panel" }, [
      el("p", { class: "kicker" }, [text.kicker]),
      el("h1", {}, [text.setupTitle]),
      el("ol", { class: "stepper" }, steps.map((label, index) =>
        el("li", { class: index === wizard.step ? "is-current" : index < wizard.step ? "is-done" : "" }, [
          String(index + 1).padStart(2, "0"),
          " ",
          label,
        ])
      )),
      wizard.step === 0 ? nameStep(text) : null,
      wizard.step === 1 ? categoryStep(text, wizard.categories, (key, on) => { wizard.categories[key] = on; }) : null,
      wizard.step === 2 ? paceStep(text, wizard, (patch) => Object.assign(wizard, patch)) : null,
      wizard.step === 3 ? linkStep(text) : null,
      notice ? el("p", { class: "form-note", role: "status" }, [notice]) : null,
      el("div", { class: "form-actions" }, [
        wizard.step > 0 ? button(text.back, () => { notice = ""; wizard.step -= 1; render(); }, "btn btn-ghost") : null,
        wizard.step < 3 ? button(text.next, () => advance(text), "btn") : null,
      ]),
    ]);
  }

  function nameStep(text) {
    const input = el("input", { id: "person-name", value: wizard.name, placeholder: text.namePlaceholder, autocomplete: "name" });
    input.addEventListener("input", () => { wizard.name = input.value; });
    return el("label", { class: "field" }, [text.nameLabel, input]);
  }

  function categoryStep(text, categories, onChange) {
    return el("fieldset", { class: "choices" }, [
      el("legend", {}, [text.categoriesHelp]),
      ...CATEGORY_ORDER.map((key) => {
        const box = el("input", { type: "checkbox" });
        box.checked = Boolean(categories[key]);
        box.addEventListener("change", () => onChange(key, box.checked));
        return el("label", { class: "choice" }, [
          box,
          el("span", {}, [
            el("strong", {}, [text[key]]),
            el("small", {}, [text[`${key}Hint`]]),
          ]),
        ]);
      }),
    ]);
  }

  function paceStep(text, draft, onChange, rerender = true) {
    const presets = el("div", { class: "presets" }, INTERVAL_PRESETS.map((minutes) => {
      const node = button(text.preset(minutes), () => {
        onChange({ intervalMinutes: minutes, custom: false });
        if (rerender) render();
        else markPresets(presets, minutes);
      }, draft.intervalMinutes === minutes && !draft.custom ? "btn" : "btn btn-ghost");
      return node;
    }));
    const custom = el("input", { type: "number", min: "5", max: "10080", value: String(draft.intervalMinutes) });
    custom.addEventListener("input", () => onChange({ intervalMinutes: Number(custom.value), custom: true }));
    const lookback = el("input", { type: "number", min: "7", max: "365", value: String(draft.lookbackDays) });
    lookback.addEventListener("input", () => onChange({ lookbackDays: Number(lookback.value) }));
    return el("div", { class: "pace" }, [
      el("p", { class: "field-label" }, [text.intervalLabel]),
      presets,
      el("label", { class: "field inline" }, [text.custom, " ", custom, " ", text.minutes]),
      el("label", { class: "field inline" }, [text.lookbackLabel, " ", lookback, " ", text.days]),
    ]);
  }

  function linkStep(text) {
    const client = el("input", { id: "client-id", value: loadClientId(persistent), placeholder: text.clientPlaceholder, spellcheck: "false" });
    return el("div", { class: "link-step" }, [
      el("p", { class: "aside" }, [text.privacy]),
      el("label", { class: "field" }, [text.clientLabel, client]),
      el("p", { class: "field-help" }, [text.clientHelp]),
      el("div", { class: "form-actions" }, [
        button(text.saveClient, () => storeClient(client.value, text), "btn btn-ghost"),
        button(busy ? text.reading : text.connect, () => connect(client.value, text), "btn"),
        button(text.useDemo, () => finishDemo(text), "btn btn-ghost"),
      ]),
      el("p", { class: "field-help" }, [text.demoNote]),
    ]);
  }

  function advance(text) {
    notice = "";
    if (wizard.step === 0 && !wizard.name.trim()) {
      notice = text.needName;
      render();
      return;
    }
    if (wizard.step === 1 && !CATEGORY_ORDER.some((key) => wizard.categories[key])) {
      notice = text.needCategory;
      render();
      return;
    }
    wizard.step += 1;
    render();
  }

  function storeClient(value, text) {
    const id = value.trim();
    if (!isClientId(id)) {
      notice = text.badClient;
      render();
      return;
    }
    saveClientId(persistent, id);
    notice = text.saved;
    render();
  }

  async function connect(value, text) {
    const id = value.trim();
    if (!isClientId(id)) {
      notice = id ? text.badClient : text.needClient;
      render();
      return;
    }
    saveClientId(persistent, id);
    if (!wizard.name.trim()) {
      notice = text.needName;
      render();
      return;
    }
    busy = true;
    notice = "";
    render();
    try {
      const token = await requestGoogleToken(id, "consent");
      const profileInfo = await getProfile(token.accessToken, fetch);
      const email = profileInfo.emailAddress || "";
      saveToken(session, email, token);
      const profile = createProfile({
        name: wizard.name.trim(),
        email,
        categories: { ...wizard.categories },
        intervalMinutes: wizard.intervalMinutes,
        lookbackDays: wizard.lookbackDays,
        connected: true,
        mode: "gmail",
      });
      state.profiles.push(profile);
      state.activeProfileId = profile.id;
      await runRead(profile, token.accessToken);
      view = "dashboard";
      wizard = freshDraft();
      notice = "";
    } catch (error) {
      notice = error?.status === 401 ? text.reconnect : text.gmailError;
    } finally {
      busy = false;
      persist();
      render();
    }
  }

  async function finishDemo(text) {
    if (!wizard.name.trim()) {
      notice = text.needName;
      wizard.step = 0;
      render();
      return;
    }
    const profile = createProfile({
      name: wizard.name.trim(),
      email: "",
      categories: { ...wizard.categories },
      intervalMinutes: wizard.intervalMinutes,
      lookbackDays: wizard.lookbackDays,
      connected: true,
      mode: "demo",
    });
    state.profiles.push(profile);
    state.activeProfileId = profile.id;
    await runRead(profile, "");
    view = "dashboard";
    wizard = freshDraft();
    notice = "";
    persist();
    render();
  }

  function renderDashboard() {
    const text = t();
    const profile = active();
    if (!profile) {
      view = "wizard";
      return renderWizard();
    }
    const items = visibleReservations(state, profile.id)
      .slice()
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const now = Date.now();
    const upcoming = items.filter((item) => !isPast(item, now));
    const past = items.filter((item) => isPast(item, now));
    const wait = profile.mode === "demo" || profile.connected
      ? msUntilNext(profile.lastSyncAt, profile.intervalMinutes, now)
      : null;

    return el("div", { class: "trip-dashboard" }, [
      el("header", { class: "trip-intro" }, [
        el("p", { class: "kicker" }, [text.kicker]),
        el("h1", {}, [text.title]),
        el("p", { class: "lede" }, [text.lede]),
        el("p", { class: "aside" }, [text.tabNote]),
      ]),
      el("div", { class: "people", role: "tablist", "aria-label": text.people }, [
        ...state.profiles.map((person) => button(person.name || person.email || "—", () => {
          state.activeProfileId = person.id;
          notice = "";
          persist();
          render();
        }, person.id === profile.id ? "person is-active" : "person")),
        button(text.addPerson, () => { view = "wizard"; wizard = freshDraft(); notice = ""; render(); }, "btn btn-ghost"),
      ]),
      el("section", { class: "trip-status" }, [
        el("p", {}, [
          el("span", { class: "status-label" }, [profile.mode === "demo" ? text.demoMode : profile.connected ? text.connected : text.notConnected]),
          profile.email ? ` · ${profile.email}` : "",
        ]),
        el("p", {}, [`${text.lastRead}: ${profile.lastSyncAt ? formatWhen(profile.lastSyncAt, lang) : text.never}`]),
        el("p", { "data-countdown": "1" }, [`${text.nextRead}: ${wait == null ? "—" : wait <= 0 ? text.dueNow : formatWait(wait, text)}`]),
        el("p", { class: "form-note", role: "status" }, [busy ? text.reading : notice || profile.lastError || ""]),
        el("div", { class: "form-actions" }, [
          button(text.syncNow, () => manualRead(profile), "btn"),
          profile.mode === "gmail" ? button(text.disconnect, () => disconnect(profile), "btn btn-ghost") : null,
          button(text.exportData, () => download(profile), "btn btn-ghost"),
        ]),
      ]),
      el("section", { class: "trip-lists" }, [
        el("h2", {}, [text.upcoming]),
        upcoming.length ? renderGroups(upcoming, text) : el("p", { class: "empty" }, [text.empty]),
        past.length ? el("h2", {}, [text.past]) : null,
        past.length ? renderGroups(past, text) : null,
      ]),
      renderSettings(profile, text),
      renderPaste(profile, text),
    ]);
  }

  function renderGroups(items, text) {
    return el("div", { class: "trip-groups" }, groupReservations(items).map((group) =>
      el("article", { class: "trip-card" }, [
        el("header", {}, [
          el("h3", {}, [group.title]),
          el("p", { class: "trip-when" }, [formatRange(group, lang, text)]),
        ]),
        el("ul", { class: "res-list" }, group.items.map((item) => renderReservation(item, text))),
      ])
    ));
  }

  function renderReservation(item, text) {
    const bits = [];
    if (item.origin || item.destination) bits.push(`${text.route}: ${[item.origin, item.destination].filter(Boolean).join(" → ")}`);
    if (item.location) bits.push(`${text.where}: ${item.location}`);
    if (item.confirmationCode) bits.push(`${text.code}: ${item.confirmationCode}`);
    if (item.passenger) bits.push(item.passenger);
    return el("li", { class: item.status === "cancelled" ? "res is-cancelled" : "res" }, [
      el("div", {}, [
        el("p", { class: "res-kind" }, [`${text[item.category]} · ${item.status === "cancelled" ? text.cancelled : text.confirmed}`]),
        el("h4", {}, [item.title || text[item.category]]),
        el("p", { class: "res-when" }, [formatRange(item, lang, text)]),
        ...bits.map((line) => el("p", { class: "res-meta" }, [line])),
        item.sourceSubject ? el("p", { class: "res-meta" }, [`${text.openMail}: ${item.sourceSubject}`]) : null,
      ]),
      button(text.hide, () => hideItem(item), "btn btn-ghost"),
    ]);
  }

  function renderSettings(profile, text) {
    const draft = {
      categories: { ...profile.categories },
      intervalMinutes: profile.intervalMinutes,
      lookbackDays: profile.lookbackDays,
      custom: !INTERVAL_PRESETS.includes(profile.intervalMinutes),
    };
    const box = el("details", { class: "settings" }, [
      el("summary", {}, [text.settings]),
    ]);
    const categories = categoryStep(text, draft.categories, (key, on) => { draft.categories[key] = on; });
    const pace = paceStep(text, draft, (patch) => Object.assign(draft, patch), false);
    box.append(
      categories,
      pace,
      el("div", { class: "form-actions" }, [
        button(text.saveSettings, () => {
          if (!CATEGORY_ORDER.some((key) => draft.categories[key])) {
            notice = text.needCategory;
            render();
            return;
          }
          profile.categories = { ...draft.categories };
          profile.intervalMinutes = draft.intervalMinutes;
          profile.lookbackDays = draft.lookbackDays;
          notice = text.saved;
          persist();
          render();
        }, "btn"),
        button(text.removePerson, () => removeProfile(profile), "btn btn-ghost"),
      ])
    );
    return box;
  }

  function renderPaste(profile, text) {
    const area = el("textarea", { rows: "6" });
    return el("section", { class: "paste" }, [
      el("h2", {}, [text.pasteTitle]),
      el("p", { class: "field-help" }, [text.pasteHelp]),
      area,
      button(text.pasteAction, () => {
        const raw = area.value.trim();
        if (!raw) return;
        const parsed = parseEmail({
          id: `paste-${stablePaste(raw)}`,
          subject: raw.slice(0, 80),
          from: "",
          html: /<script/i.test(raw) ? raw : "",
          text: raw,
        });
        if (!parsed.length) {
          notice = text.pasteEmpty;
          render();
          return;
        }
        state = upsertReservations(state, profile.id, parsed);
        notice = text.pasteOk;
        persist();
        render();
      }, "btn"),
    ]);
  }

  async function manualRead(profile) {
    notice = "";
    busy = true;
    render();
    try {
      if (profile.mode === "gmail") {
        const token = await ensureToken(profile);
        await runRead(profile, token);
      } else {
        await runRead(profile, "");
      }
      notice = visibleReservations(state, profile.id).length ? t().readOk : t().readEmpty;
    } catch (error) {
      profile.lastError = error?.status === 401 ? t().reconnect : t().gmailError;
      notice = profile.lastError;
    } finally {
      busy = false;
      persist();
      render();
    }
  }

  async function ensureToken(profile) {
    const current = tokenFor(session, profile.email, Date.now());
    if (current) return current;
    const clientId = loadClientId(persistent);
    if (!isClientId(clientId)) throw Object.assign(new Error("client"), { status: 401 });
    const token = await requestGoogleToken(clientId, "");
    const info = await getProfile(token.accessToken, fetch);
    const email = info.emailAddress || profile.email;
    if (email && profile.email && email.toLowerCase() !== profile.email.toLowerCase()) {
      throw Object.assign(new Error("account"), { status: 401 });
    }
    profile.email = email;
    saveToken(session, email, token);
    return token.accessToken;
  }

  async function runRead(profile, token) {
    const messages = profile.mode === "demo" ? DEMO_MESSAGES : null;
    const found = await readMailbox({ profile, token, fetchImpl: fetch, messages });
    state = upsertReservations(state, profile.id, found);
    const saved = state.profiles.find((item) => item.id === profile.id);
    if (saved) {
      saved.lastSyncAt = new Date().toISOString();
      saved.lastError = "";
      saved.connected = true;
    }
  }

  function disconnect(profile) {
    profile.connected = false;
    profile.mode = "gmail";
    notice = t().reconnect;
    persist();
    render();
  }

  function removeProfile(profile) {
    state.profiles = state.profiles.filter((item) => item.id !== profile.id);
    state.reservations = state.reservations.filter((item) => item.profileId !== profile.id);
    state.activeProfileId = state.profiles[0]?.id || "";
    if (!state.profiles.length) view = "wizard";
    notice = "";
    persist();
    render();
  }

  function hideItem(item) {
    const profile = state.profiles.find((person) => person.id === item.profileId);
    if (!profile) return;
    if (!profile.dismissed.includes(item.id)) profile.dismissed.push(item.id);
    state.reservations = state.reservations.filter((reservation) => reservation.id !== item.id);
    persist();
    render();
  }

  function download(profile) {
    const payload = {
      profile: { name: profile.name, email: profile.email, categories: profile.categories, intervalMinutes: profile.intervalMinutes },
      reservations: visibleReservations(state, profile.id),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: `${profile.name || "trips"}.json` });
    link.click();
    URL.revokeObjectURL(url);
  }

  async function tick() {
    if (view !== "dashboard" || busy) return;
    const text = t();
    const due = state.profiles.filter((profile) => profile.connected && isDue(profile.lastSyncAt, profile.intervalMinutes, Date.now()));
    for (const profile of due) {
      if (profile.mode === "demo") {
        await runRead(profile, "");
        continue;
      }
      const token = tokenFor(session, profile.email, Date.now());
      if (!token) {
        profile.lastError = text.reconnect;
        continue;
      }
      try {
        await runRead(profile, token);
      } catch (error) {
        profile.lastError = error?.status === 401 ? text.reconnect : text.gmailError;
      }
    }
    if (due.length) persist();
    const countdown = root.querySelector("[data-countdown]");
    const profile = active();
    if (countdown && profile && view === "dashboard") {
      const wait = msUntilNext(profile.lastSyncAt, profile.intervalMinutes, Date.now());
      countdown.textContent = `${text.nextRead}: ${wait <= 0 ? text.dueNow : formatWait(wait, text)}`;
    }
    if (due.length) render();
  }

  function bindChrome() {
    doc.querySelectorAll("[data-lang-switch]").forEach((buttonNode) => {
      buttonNode.addEventListener("click", () => {
        lang = buttonNode.getAttribute("data-lang-switch") === "es" ? "es" : "en";
        try { localStorage.setItem("it-lang", lang); } catch { /* ignore */ }
        render();
      });
    });
  }

  function arm() {
    timer = window.setInterval(() => { tick().catch(() => {}); }, 20_000);
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "visible") tick().catch(() => {});
    });
  }

  return { render, bindChrome, arm, stop: () => window.clearInterval(timer) };
}

function markPresets(container, minutes) {
  [...container.children].forEach((node, index) => {
    node.className = INTERVAL_PRESETS[index] === minutes ? "btn" : "btn btn-ghost";
  });
}

function freshDraft() {
  return {
    step: 0,
    name: "",
    categories: { flight: true, lodging: true, transport: true, event: false },
    intervalMinutes: 60,
    lookbackDays: 120,
    custom: false,
  };
}

function isClientId(value) {
  return /^[0-9A-Za-z-]+\.apps\.googleusercontent\.com$/.test(value);
}

function requestGoogleToken(clientId, prompt) {
  return loadGis().then(() => new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (response) => {
        if (!response || response.error) {
          reject(Object.assign(new Error(response?.error || "auth"), { status: 401 }));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
        });
      },
    });
    client.requestAccessToken({ prompt });
  }));
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis"));
    document.head.appendChild(script);
  });
}

function applyChrome(doc, text, lang) {
  doc.documentElement.lang = lang;
  doc.title = text.docTitle;
  const description = doc.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", text.docDescription);
  doc.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = lookup(text, node.getAttribute("data-i18n"));
    if (typeof value === "string") node.textContent = value;
  });
  doc.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    const value = lookup(text, node.getAttribute("data-i18n-aria"));
    if (typeof value === "string") node.setAttribute("aria-label", value);
  });
  doc.querySelectorAll("[data-lang-switch]").forEach((node) => {
    node.setAttribute("aria-pressed", node.getAttribute("data-lang-switch") === lang ? "true" : "false");
  });
}

function lookup(obj, path) {
  return String(path || "").split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function isPast(item, now) {
  const end = Date.parse(item.end || item.start || "");
  return !Number.isNaN(end) && end < now;
}

function formatWhen(value, lang) {
  if (!value) return "";
  const locale = lang === "es" ? "es-AR" : "en-US";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatRange(item, lang, text) {
  const start = formatWhen(item.start, lang);
  const end = formatWhen(item.end, lang);
  if (start && end) return `${text.from} ${start} · ${text.to} ${end}`;
  return start || end || "";
}

function formatWait(ms, text) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return text.inMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  return text.inHours(hours, minutes % 60);
}

function stablePaste(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

function button(label, onClick, className) {
  const node = el("button", { type: "button", class: className }, [label]);
  node.addEventListener("click", onClick);
  return node;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children || []) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
