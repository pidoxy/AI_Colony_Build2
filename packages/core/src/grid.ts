/**
 * Grid helpers (R5): start/end must fall on a fixed minute grid evaluated in
 * campus local time. Wall-clock math only — never converts to UTC here; the
 * caller converts back to a `Date` for storage.
 */

export interface WallClock {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number; // 0–59
}

/** Minutes since local midnight. */
export function minutesSinceMidnight(local: WallClock): number {
  return local.hour * 60 + local.minute;
}

/** True when the wall-clock time falls on the grid (e.g. 30 min → :00/:30 only). */
export function isOnGrid(local: WallClock, gridMinutes: number): boolean {
  if (local.hour === 0 && local.minute === 0) return true; // midnight
  const m = minutesSinceMidnight(local);
  return m > 0 && m % gridMinutes === 0;
}

/**
 * Parses "HH:MM" (opening-hours columns are `time` in campus local).
 * Returns minutes since local midnight.
 */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`invalid time: ${hhmm}`);
  }
  return h * 60 + m;
}
