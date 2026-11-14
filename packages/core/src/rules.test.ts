import { describe, expect, it } from "vitest";
import type { PolicyMap } from "@crs/policy";
import {
  startOfCampusWeek,
  toWallClock,
  validateBookingWindow,
  validateNotSuspended,
  validateWeeklyLimit,
} from "./index.js";
import { BookingRuleError } from "./errors.js";

const TZ = "Africa/Lagos";

const policy: PolicyMap = {
  search_max_staleness_seconds: 5,
  available_soon_window_hours: 2,
  slot_grid_minutes: 30,
  min_duration_minutes: 30,
  max_duration_minutes: 180,
  max_booking_horizon_days: 14,
  weekly_booking_limit: 5,
  checkin_opens_before_start_minutes: 10,
  checkin_closes_after_start_minutes: 15,
  just_released_window_hours: 2,
  noshow_window_days: 30,
  noshow_suspension_threshold: 3,
  suspension_days: 7,
  reminder_minutes_before_start: 60,
};

// Lagos is UTC+1 year-round (no DST), so 10:00 local = 09:00 UTC.
const now = new Date("2026-11-14T05:00:00Z"); // Sat 14 Nov 2026, 06:00 Lagos
function at(utcIso: string) {
  return new Date(utcIso);
}
const ctx = { policy, timeZone: TZ, now };

describe("grid", () => {
  it("accepts times on the 30-minute grid", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T10:00:00Z"), at("2026-11-14T11:00:00Z"), "08:00", "20:00")
    ).not.toThrow();
  });
  it("rejects times not on the grid", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T10:15:00Z"), at("2026-11-14T11:00:00Z"), "08:00", "20:00")
    ).toThrowError(expect.objectContaining({ code: "NOT_ON_GRID" }));
  });
});

describe("duration", () => {
  it("accepts 30 minutes", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T10:00:00Z"), at("2026-11-14T10:30:00Z"), "08:00", "20:00")
    ).not.toThrow();
  });
  it("accepts 3 hours", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T10:00:00Z"), at("2026-11-14T13:00:00Z"), "08:00", "20:00")
    ).not.toThrow();
  });
  it("rejects under 30 minutes", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T10:00:00Z"), at("2026-11-14T10:20:00Z"), "08:00", "20:00")
    ).toThrowError(expect.objectContaining({ code: "NOT_ON_GRID" })); // 10:20 not on grid
  });
  it("rejects over 3 hours", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T10:00:00Z"), at("2026-11-14T13:30:00Z"), "08:00", "20:00")
    ).toThrowError(expect.objectContaining({ code: "DURATION_TOO_LONG" }));
  });
});

describe("horizon", () => {
  it("rejects beyond 14 days ahead", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-29T10:00:00Z"), at("2026-11-29T11:00:00Z"), "08:00", "20:00")
    ).toThrowError(expect.objectContaining({ code: "BEYOND_HORIZON" }));
  });
});

describe("opening hours", () => {
  it("rejects before opening", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T06:30:00Z"), at("2026-11-14T07:30:00Z"), "08:00", "20:00")
      // 06:30 UTC = 07:30 Lagos < 08:00 open
    ).toThrowError(expect.objectContaining({ code: "OUTSIDE_OPENING_HOURS" }));
  });
  it("rejects end after closing", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T18:30:00Z"), at("2026-11-14T19:30:00Z"), "08:00", "20:00")
      // 19:30 UTC = 20:30 Lagos > 20:00 close
    ).toThrowError(expect.objectContaining({ code: "OUTSIDE_OPENING_HOURS" }));
  });
});

describe("past / ordering", () => {
  it("rejects a start in the past", () => {
    // 04:00 UTC = 05:00 Lagos. Now = 06:00 Lagos.
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T04:00:00Z"), at("2026-11-14T07:00:00Z"), "08:00", "20:00")
    ).toThrowError(expect.objectContaining({ code: "IN_PAST" }));
  });
  it("rejects end not after start", () => {
    expect(() =>
      validateBookingWindow(ctx, at("2026-11-14T11:00:00Z"), at("2026-11-14T10:00:00Z"), "08:00", "20:00")
    ).toThrowError(expect.objectContaining({ code: "END_NOT_AFTER_START" }));
  });
});

describe("weekly limit", () => {
  it("passes under the limit", () => {
    expect(() => validateWeeklyLimit(ctx, 4)).not.toThrow();
  });
  it("rejects at the limit", () => {
    expect(() => validateWeeklyLimit(ctx, 5)).toThrowError(
      expect.objectContaining({ code: "WEEKLY_LIMIT_REACHED" })
    );
  });
});

describe("suspension", () => {
  it("passes when not suspended", () => {
    expect(() => validateNotSuspended(null, now)).not.toThrow();
    expect(() => validateNotSuspended(new Date(now.getTime() - 1000), now)).not.toThrow();
  });
  it("rejects while suspended", () => {
    expect(() => validateNotSuspended(new Date(now.getTime() + 1000), now)).toThrowError(
      expect.objectContaining({ code: "SUSPENDED" })
    );
  });
});

describe("campus week", () => {
  it("R9: Monday start of the Mon–Sun campus week", () => {
    // Sat 14 Nov 2026 08:00 Lagos is in the week of Mon 9 Nov – Sun 15 Nov.
    const start = startOfCampusWeek(now, TZ);
    const local = toWallClock(start, TZ);
    expect([local.year, local.month, local.day, local.hour, local.minute]).toEqual([
      2026, 11, 9, 0, 0,
    ]);
  });
  it("Sunday belongs to the previous Monday's week", () => {
    const sunday = new Date("2026-11-15T22:00:00Z"); // Sun 15 Nov 23:00 Lagos
    const start = startOfCampusWeek(sunday, TZ);
    const local = toWallClock(start, TZ);
    expect(local.day).toBe(9); // still Mon 9 Nov
  });
});
