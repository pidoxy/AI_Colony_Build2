import type { Db } from "@crs/db";
import { sql } from "kysely";

/**
 * Policy values (R20): every bracketed number from the brief lives in the
 * `policy` table, never in code. Services read via this loader which caches a
 * snapshot for a short TTL so an operator's edit takes effect without a deploy.
 *
 * Failure strategy: fail-OPEN on cache hit, fail-CLOSED on first read with no
 * cache (booking must never run with elastic limits). See isFailure.
 */

export const PolicyValues = {
  searchMaxStalenessSeconds: "search_max_staleness_seconds",
  availableSoonWindowHours: "available_soon_window_hours",
  slotGridMinutes: "slot_grid_minutes",
  minDurationMinutes: "min_duration_minutes",
  maxDurationMinutes: "max_duration_minutes",
  maxBookingHorizonDays: "max_booking_horizon_days",
  weeklyBookingLimit: "weekly_booking_limit",
  checkinOpensBeforeStartMinutes: "checkin_opens_before_start_minutes",
  checkinClosesAfterStartMinutes: "checkin_closes_after_start_minutes",
  justReleasedWindowHours: "just_released_window_hours",
  noshowWindowDays: "noshow_window_days",
  noshowSuspensionThreshold: "noshow_suspension_threshold",
  suspensionDays: "suspension_days",
  reminderMinutesBeforeStart: "reminder_minutes_before_start",
} as const;
export type PolicyKey = (typeof PolicyValues)[keyof typeof PolicyValues];

export type PolicyMap = { [K in PolicyKey]: number };

export class PolicyUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Policy table unavailable and no cached snapshot: ${String(cause)}`);
    this.name = "PolicyUnavailableError";
  }
}

const TTL_MS = 30_000;

export class PolicyLoader {
  private cache: { values: PolicyMap; loadedAt: number } | null = null;

  constructor(private readonly db: Db) {}

  /** Returns the current snapshot, refreshing if older than TTL. */
  async get(): Promise<PolicyMap> {
    const now = Date.now();
    if (this.cache && now - this.cache.loadedAt < TTL_MS) return this.cache.values;
    try {
      const rows = await sql<{ key: string; value: unknown }>`
        SELECT key, value FROM policy
      `.execute(this.db);
      const values = Object.fromEntries(
        rows.rows.map((r) => [r.key, toNumber(r.value)])
      ) as PolicyMap;
      this.assertComplete(values);
      this.cache = { values, loadedAt: now };
      return values;
    } catch (err) {
      if (this.cache) return this.cache.values; // serve stale, never elastic
      throw new PolicyUnavailableError(err);
    }
  }

  /** Force refresh (used after operator updates). */
  async refresh(): Promise<PolicyMap> {
    this.cache = null;
    return this.get();
  }

  private assertComplete(values: PolicyMap): void {
    const missing = Object.values(PolicyValues).filter((k) => !(k in values));
    if (missing.length > 0) {
      throw new PolicyUnavailableError(
        new Error(`policy rows missing: ${missing.join(", ")}`)
      );
    }
  }
}

function toNumber(v: unknown): number {
  // policy.value is jsonb; stored as '5' (JSON number) → JS number already
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  throw new Error(`policy value not a number: ${JSON.stringify(v)}`);
}

/** Number from the snapshot with a friendly name for error messages. */
export function policyNumber(p: PolicyMap, key: PolicyKey): number {
  return p[key];
}
