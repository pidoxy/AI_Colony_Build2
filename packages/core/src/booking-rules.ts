import { type PolicyMap } from "@crs/policy";
import { BookingRuleError } from "./errors.js";
import { isOnGrid, timeToMinutes } from "./grid.js";
import { startOfCampusWeek, toWallClock } from "./week.js";

/**
 * Booking rule validators (R5, R9, R15). Pure functions: the API calls them
 * inside the booking transaction with a fresh policy snapshot, so nothing here
 * touches the database and everything is unit-testable with a fake clock.
 */

export interface RuleContext {
  policy: PolicyMap;
  timeZone: string;
  now: Date;
}

/** R5: grid, duration, horizon, opening hours, not in the past, end > start. */
export function validateBookingWindow(
  ctx: RuleContext,
  start: Date,
  end: Date,
  opensAt: string, // "HH:MM" campus local
  closesAt: string
): void {
  if (end <= start) {
    throw new BookingRuleError("END_NOT_AFTER_START", "end must be after start");
  }
  if (start <= ctx.now) {
    throw new BookingRuleError("IN_PAST", "start must be in the future");
  }

  const grid = ctx.policy.slot_grid_minutes;
  const startLocal = toWallClock(start, ctx.timeZone);
  const endLocal = toWallClock(end, ctx.timeZone);
  if (!isOnGrid(startLocal, grid) || !isOnGrid(endLocal, grid)) {
    throw new BookingRuleError(
      "NOT_ON_GRID",
      `start and end must fall on the ${grid}-minute grid (campus time)`
    );
  }

  const durationMin = (end.getTime() - start.getTime()) / 60_000;
  if (durationMin < ctx.policy.min_duration_minutes) {
    throw new BookingRuleError(
      "DURATION_TOO_SHORT",
      `duration must be at least ${ctx.policy.min_duration_minutes} minutes`
    );
  }
  if (durationMin > ctx.policy.max_duration_minutes) {
    throw new BookingRuleError(
      "DURATION_TOO_LONG",
      `duration must be at most ${ctx.policy.max_duration_minutes} minutes`
    );
  }

  const horizonEnd = new Date(
    ctx.now.getTime() + ctx.policy.max_booking_horizon_days * 24 * 60 * 60_000
  );
  if (start > horizonEnd) {
    throw new BookingRuleError(
      "BEYOND_HORIZON",
      `start may be at most ${ctx.policy.max_booking_horizon_days} days ahead`
    );
  }

  // Booking must lie fully inside [opensAt, closesAt] on its own campus-local day.
  const openMin = timeToMinutes(opensAt);
  const closeMin = timeToMinutes(closesAt);
  const startMin = startLocal.hour * 60 + startLocal.minute;
  const sameDay =
    startLocal.year === endLocal.year &&
    startLocal.month === endLocal.month &&
    startLocal.day === endLocal.day;
  const endMin = sameDay
    ? endLocal.hour * 60 + endLocal.minute
    : Number.POSITIVE_INFINITY;
  if (startMin < openMin || endMin > closeMin) {
    throw new BookingRuleError(
      "OUTSIDE_OPENING_HOURS",
      `booking must be within opening hours ${opensAt}–${closesAt} (campus time)`
    );
  }
}

/**
 * R9: at most `weekly_booking_limit` bookings per campus calendar week.
 * Cancelled bookings do not count; no-shows do. The caller counts them
 * (with the student row locked in the same transaction) and passes the number.
 */
export function validateWeeklyLimit(ctx: RuleContext, countUsedThisWeek: number): void {
  if (countUsedThisWeek >= ctx.policy.weekly_booking_limit) {
    throw new BookingRuleError(
      "WEEKLY_LIMIT_REACHED",
      `weekly booking limit of ${ctx.policy.weekly_booking_limit} reached`
    );
  }
}

/** R15: suspended students may still search but may not book. */
export function validateNotSuspended(suspendedUntil: Date | null, now: Date): void {
  if (suspendedUntil && suspendedUntil > now) {
    throw new BookingRuleError(
      "SUSPENDED",
      `booking suspended until ${suspendedUntil.toISOString()}`
    );
  }
}

export { startOfCampusWeek };
