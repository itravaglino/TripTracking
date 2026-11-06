export const CATEGORY_KEYS = ["flight", "lodging", "transport", "plan", "event"];

export const DEFAULT_CATEGORIES = {
  flight: true,
  lodging: true,
  transport: true,
  plan: true,
  event: false,
};

export function normalizeCategories(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const key of CATEGORY_KEYS) {
    if (typeof input[key] !== "boolean") return null;
    out[key] = input[key];
  }
  if (!CATEGORY_KEYS.some((key) => out[key])) return null;
  return out;
}

export function normalizeInterval(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10080) return null;
  return minutes;
}
