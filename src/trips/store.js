import { clampInterval } from "./schedule.js";

export const STORAGE_KEY = "it-trips-v1";
export const CLIENT_ID_KEY = "it-trips-client-id";
export const TOKEN_KEY = "it-trips-tokens";

export const CATEGORIES = ["flight", "lodging", "transport", "event"];

const DEFAULT_CATEGORIES = {
  flight: true,
  lodging: true,
  transport: true,
  event: false,
};

export function emptyState() {
  return { version: 1, activeProfileId: "", profiles: [], reservations: [] };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function createProfile(input, now = new Date().toISOString()) {
  const id = input.id || `p_${Math.random().toString(36).slice(2, 10)}`;
  return normalizeProfile({
    id,
    name: input.name || "",
    email: input.email || "",
    categories: input.categories || DEFAULT_CATEGORIES,
    intervalMinutes: input.intervalMinutes ?? 60,
    lookbackDays: input.lookbackDays ?? 120,
    connected: Boolean(input.connected),
    mode: input.mode === "demo" ? "demo" : "gmail",
    lastSyncAt: input.lastSyncAt || "",
    lastError: input.lastError || "",
    dismissed: input.dismissed || [],
    createdAt: input.createdAt || now,
  });
}

export function upsertReservations(state, profileId, incoming) {
  const next = normalizeState(state);
  const profile = next.profiles.find((item) => item.id === profileId);
  if (!profile) return next;
  const dismissed = new Set(profile.dismissed);
  const kept = next.reservations.filter((item) => item.profileId !== profileId);
  const fresh = incoming
    .filter((item) => profile.categories[item.category])
    .map((item) => ({
      ...item,
      id: reservationId(profileId, item),
      profileId,
    }))
    .filter((item) => !dismissed.has(item.id));
  const byId = new Map();
  for (const item of fresh) byId.set(item.id, item);
  next.reservations = [...kept, ...byId.values()];
  return next;
}

export function visibleReservations(state, profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return [];
  return state.reservations.filter(
    (item) => item.profileId === profileId && profile.categories[item.category] && !profile.dismissed.includes(item.id)
  );
}

export function reservationId(profileId, item) {
  return stableId([
    profileId,
    item.sourceMessageId,
    item.category,
    item.confirmationCode,
    item.start,
    item.title,
    String(item.index ?? 0),
  ].join("|"));
}

export function loadClientId(storage) {
  try {
    return storage.getItem(CLIENT_ID_KEY) || "";
  } catch {
    return "";
  }
}

export function saveClientId(storage, clientId) {
  storage.setItem(CLIENT_ID_KEY, String(clientId || "").trim());
}

export function loadTokens(storage) {
  try {
    const raw = storage.getItem(TOKEN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveToken(storage, email, token) {
  const all = loadTokens(storage);
  if (!email) return all;
  all[email.toLowerCase()] = {
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
  };
  storage.setItem(TOKEN_KEY, JSON.stringify(all));
  return all;
}

export function tokenFor(storage, email, now) {
  if (!email) return "";
  const entry = loadTokens(storage)[email.toLowerCase()];
  if (!entry?.accessToken) return "";
  if (entry.expiresAt && entry.expiresAt <= now + 30_000) return "";
  return entry.accessToken;
}

function normalizeState(input) {
  const state = emptyState();
  if (!input || typeof input !== "object") return state;
  state.profiles = Array.isArray(input.profiles) ? input.profiles.map((item) => normalizeProfile(item)) : [];
  state.activeProfileId = state.profiles.some((item) => item.id === input.activeProfileId)
    ? input.activeProfileId
    : state.profiles[0]?.id || "";
  state.reservations = Array.isArray(input.reservations)
    ? input.reservations.filter((item) => item && state.profiles.some((profile) => profile.id === item.profileId))
    : [];
  return state;
}

function normalizeProfile(input) {
  const categories = { ...DEFAULT_CATEGORIES };
  for (const key of CATEGORIES) {
    if (input?.categories && typeof input.categories[key] === "boolean") categories[key] = input.categories[key];
  }
  const lookback = Number(input?.lookbackDays);
  return {
    id: String(input?.id || ""),
    name: String(input?.name || "").trim(),
    email: String(input?.email || "").trim(),
    categories,
    intervalMinutes: clampInterval(input?.intervalMinutes ?? 60),
    lookbackDays: Number.isFinite(lookback) ? Math.min(365, Math.max(7, Math.round(lookback))) : 120,
    connected: Boolean(input?.connected),
    mode: input?.mode === "demo" ? "demo" : input?.mode === "gmail" ? "gmail" : "",
    lastSyncAt: input?.lastSyncAt || "",
    lastError: input?.lastError || "",
    dismissed: Array.isArray(input?.dismissed) ? input.dismissed.map(String) : [],
    createdAt: input?.createdAt || "",
  };
}

function stableId(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  return `r_${hash.toString(16)}`;
}
