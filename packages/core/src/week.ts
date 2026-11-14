import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Calendar-week math in campus local time (R9: Monday–Sunday campus week).
 * All inputs are UTC instants; all boundaries come back as UTC instants.
 */

/** Monday 00:00 (campus local) of the week containing `instant`, as a UTC instant. */
export function startOfCampusWeek(instant: Date, timeZone: string): Date {
  const zoned = toZonedTime(instant, timeZone);
  const dow = zoned.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon=0..Sun=6
  const mondayLocal = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate() - daysSinceMonday,
    0, 0, 0, 0
  );
  return fromZonedTime(mondayLocal, timeZone);
}

/** Next Monday 00:00 (campus local) after `instant`, as a UTC instant. */
export function endOfCampusWeekEnd(instant: Date, timeZone: string): Date {
  const start = startOfCampusWeek(instant, timeZone);
  const zonedStart = toZonedTime(start, timeZone);
  const nextMondayLocal = new Date(
    zonedStart.getFullYear(),
    zonedStart.getMonth(),
    zonedStart.getDate() + 7,
    0, 0, 0, 0
  );
  return fromZonedTime(nextMondayLocal, timeZone);
}

/** Convert a UTC instant to a plain wall-clock object in the campus zone. */
export function toWallClock(instant: Date, timeZone: string) {
  const zoned = toZonedTime(instant, timeZone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
  };
}

/** Format an instant in the campus zone, e.g. "2026-11-14 08:30". */
export function formatCampus(instant: Date, timeZone: string, pattern = "yyyy-MM-dd HH:mm"): string {
  return formatInTimeZone(instant, timeZone, pattern);
}
