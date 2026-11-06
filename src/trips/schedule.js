export const INTERVAL_PRESETS = [15, 30, 60, 180, 720, 1440];
export const MIN_INTERVAL = 5;
export const MAX_INTERVAL = 7 * 24 * 60;

export function clampInterval(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return 60;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(value)));
}

export function isDue(lastSyncAt, intervalMinutes, now) {
  if (!lastSyncAt) return true;
  const last = Date.parse(lastSyncAt);
  if (Number.isNaN(last)) return true;
  return now - last >= clampInterval(intervalMinutes) * 60 * 1000;
}

export function msUntilNext(lastSyncAt, intervalMinutes, now) {
  if (!lastSyncAt) return 0;
  const last = Date.parse(lastSyncAt);
  if (Number.isNaN(last)) return 0;
  const due = last + clampInterval(intervalMinutes) * 60 * 1000;
  return Math.max(0, due - now);
}
