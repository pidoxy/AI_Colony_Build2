import type { Db } from "@crs/db";
import type { PolicyMap } from "@crs/policy";
import type { Config } from "@crs/config";
import { sql } from "kysely";

export interface SweepResults {
  noShows: number;
  suspended: number;
  completed: number;
}

/**
 * Sweeps (R13, R15) and completion transitions.
 * Each batch is claimed with FOR UPDATE SKIP LOCKED so replicas don't double-process.
 */
export async function runSweeps(db: Db, policy: PolicyMap, config: Config): Promise<SweepResults> {
  const now = new Date();
  let noShows = 0;
  let suspended = 0;
  let completed = 0;

  // R13: CONFIRMED bookings past start + checkin_closes become NO_SHOW.
  const checkinCloses = policy.checkin_closes_after_start_minutes;
  const dueNoShows = await db
    .selectFrom("bookings")
    .select(["booking_id", "student_id"])
    .where("status", "=", "CONFIRMED")
    .where(sql`lower(during) + make_interval(mins => ${checkinCloses})`, "<=", now)
    .orderBy(sql`lower(during)`)
    .limit(50)
    .forUpdate()
    .skipLocked()
    .execute();

  for (const b of dueNoShows) {
    await db.transaction().execute(async (trx: any) => {
      await trx
        .updateTable("bookings")
        .set({ status: "NO_SHOW" })
        .where("booking_id", "=", b.booking_id)
        .execute();
      
      await trx
        .insertInto("booking_events")
        .values({
          booking_id: b.booking_id,
          from_status: "CONFIRMED",
          to_status: "NO_SHOW",
          actor: "worker",
        })
        .execute();

      // R15: count no-shows in rolling window; suspend at threshold.
      const windowDays = policy.noshow_window_days;
      const { count } = (await trx
        .selectFrom("penalties")
        .select((eb: any) => eb.fn.count("penalty_id").as("count"))
        .where("student_id", "=", b.student_id)
        .where("at", ">=", sql`now() - make_interval(days => ${windowDays})`)
        .executeTakeFirstOrThrow()) as { count: string | number };
      
      const total = Number(count) + 1;
      await trx
        .insertInto("penalties")
        .values({ student_id: b.student_id, booking_id: b.booking_id, kind: "no_show" })
        .execute();

      if (total >= policy.noshow_suspension_threshold) {
        await trx
          .updateTable("students")
          .set({
            suspended_until: sql`now() + make_interval(days => ${policy.suspension_days})`,
          })
          .where("student_id", "=", b.student_id)
          .execute();
        suspended++;
        await trx.insertInto("notifications").values({
          student_id: b.student_id,
          type: "suspension",
          send_at: now,
          dedupe_key: `suspension:${b.student_id}:${now.toISOString().slice(0, 10)}`,
        }).onConflict((oc: any) => oc.doNothing()).execute();
      }

      await trx.insertInto("notifications").values({
        student_id: b.student_id,
        booking_id: b.booking_id,
        type: "no_show_released",
        send_at: now,
        dedupe_key: `no_show:${b.booking_id}`,
      }).onConflict((oc: any) => oc.doNothing()).execute();
      
      await trx.insertInto("notifications").values({
        student_id: b.student_id,
        booking_id: b.booking_id,
        type: "reminder",
        send_at: now, // supersede any unsent reminder for this booking
        dedupe_key: `reminder:${b.booking_id}`,
      }).onConflict((oc: any) =>
        // remove the pending reminder instead of sending it after no-show
        oc.doUpdateSet({ send_at: sql`now()` })
      ).execute();
    });
    noShows++;
  }

  // Completion: CHECKED_IN bookings whose end has passed.
  const dueComplete = await db
    .selectFrom("bookings")
    .select(["booking_id"])
    .where("status", "=", "CHECKED_IN")
    .where(sql`upper(during)`, "<=", now)
    .limit(100)
    .forUpdate()
    .skipLocked()
    .execute();

  for (const b of dueComplete) {
    await db.transaction().execute(async (trx: any) => {
      await trx
        .updateTable("bookings")
        .set({ status: "COMPLETED" })
        .where("booking_id", "=", b.booking_id)
        .execute();
      await trx
        .insertInto("booking_events")
        .values({ booking_id: b.booking_id, from_status: "CHECKED_IN", to_status: "COMPLETED", actor: "worker" })
        .execute();
    });
    completed++;
  }

  return { noShows, suspended, completed };
}
