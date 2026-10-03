export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export const WINDOWS = {
  "24h": 1 * DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
} as const;

export type WindowKey = keyof typeof WINDOWS;

export const WINDOW_KEYS = Object.keys(WINDOWS) as WindowKey[];

export const DEFAULT_WINDOW: WindowKey = "30d";

export function isWindowKey(s: unknown): s is WindowKey {
  return typeof s === "string" && s in WINDOWS;
}

export function windowStart(now: Date, w: WindowKey): Date {
  return new Date(now.getTime() - WINDOWS[w]);
}
