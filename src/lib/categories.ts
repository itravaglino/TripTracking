export const CATEGORIES = ["flight", "lodging", "transport", "plan", "event"] as const;

export type Category = (typeof CATEGORIES)[number];

export type Preferences = {
  trackFlight: boolean;
  trackLodging: boolean;
  trackTransport: boolean;
  trackPlan: boolean;
  trackEvent: boolean;
  syncIntervalMinutes: number;
  lookbackDays: number;
};

export const INTERVAL_OPTIONS = [15, 60, 180, 360, 720, 1440, 10080] as const;
export const LOOKBACK_OPTIONS = [30, 90, 180, 365] as const;

const COLUMN: Record<Category, keyof Preferences> = {
  flight: "trackFlight",
  lodging: "trackLodging",
  transport: "trackTransport",
  plan: "trackPlan",
  event: "trackEvent",
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function categoryEnabled(prefs: Preferences, category: Category): boolean {
  return Boolean(prefs[COLUMN[category]]);
}

export function clampPreferences(input: Partial<Preferences>): Preferences {
  const interval = Number(input.syncIntervalMinutes);
  const lookback = Number(input.lookbackDays);
  return {
    trackFlight: input.trackFlight !== false,
    trackLodging: input.trackLodging !== false,
    trackTransport: input.trackTransport !== false,
    trackPlan: input.trackPlan !== false,
    trackEvent: input.trackEvent === true,
    syncIntervalMinutes: (INTERVAL_OPTIONS as readonly number[]).includes(interval) ? interval : 360,
    lookbackDays: (LOOKBACK_OPTIONS as readonly number[]).includes(lookback) ? lookback : 180,
  };
}

export function enabledCategories(prefs: Preferences): Category[] {
  return CATEGORIES.filter((category) => categoryEnabled(prefs, category));
}
