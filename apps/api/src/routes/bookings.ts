import { type FastifyPluginAsync } from "fastify";
import { sql } from "kysely";
import { validateBookingWindow, validateNotSuspended, validateWeeklyLimit, startOfCampusWeek } from "@crs/core";

const ACTIVE = ["CONFIRMED", "CHECKED_IN"] as const;

function bookingSelect(db: any) {
  return db.selectFrom("bookings").innerJoin("rooms", "rooms.room_id", "bookings.room_id").select([
    "bookings.booking_id as bookingId", "bookings.room_id as roomId", "rooms.code as roomCode", "rooms.name as roomName",
    sql<string>`lower(bookings.during)`.as("start"), sql<string>`upper(bookings.during)`.as("end"), "bookings.purpose", "bookings.status", "bookings.checked_in_at as checkedInAt", "bookings.cancelled_at as cancelledAt", "bookings.created_at as createdAt",
  ]);
}

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me/bookings", async (req) => {
    const status = (req.query as any)?.status;
    const rows = await bookingSelect(app.db).where("bookings.student_id", "=", req.studentId).if(status === "upcoming", (q: any) => q.where("bookings.status", "in", ACTIVE as unknown as string[])).orderBy(sql`lower(bookings.during)`, "asc").execute();
    return { bookings: rows.map((r: any) => ({ ...r, during: { start: r.start, end: r.end } })) };
  });

  app.get("/me/standing", async (req) => {
    const now = new Date();
    const week = startOfCampusWeek(now, "Africa/Lagos");
    const next = new Date(week.getTime() + 7 * 86400000);
    const student = await app.db.selectFrom("students").selectAll().where("student_id", "=", req.studentId).executeTakeFirst();
    const p = await app.policy.get();
    const count = await app.db.selectFrom("bookings").select(sql<number>`count(*)::int`.as("count")).where("student_id", "=", req.studentId).where("status", "!=", "CANCELLED").where(sql<boolean>`lower(during) >= ${week.toISOString()}::timestamptz AND lower(during) < ${next.toISOString()}::timestamptz`).executeTakeFirst();
    const noShows = await app.db.selectFrom("penalties").select(sql<number>`count(*)::int`.as("count")).where("student_id", "=", req.studentId).where(sql<boolean>`at >= now() - interval '30 days'`).executeTakeFirst();
    return { studentId: req.studentId, displayName: student?.display_name ?? "Campus student", email: student?.email ?? `${req.studentId}@campus.edu.ng`, suspendedUntil: student?.suspended_until ?? null, bookingsUsedThisWeek: Number(count?.count ?? 0), weeklyBookingLimit: p.weekly_booking_limit, noShowsInRollingWindow: Number(noShows?.count ?? 0) };
  });

  app.post("/bookings", async (req, reply) => {
    const body = req.body as { roomId: string; start: string; end: string; purpose?: string };
    const key = String(req.headers["idempotency-key"] ?? crypto.randomUUID());
    const start = new Date(body.start); const end = new Date(body.end); const now = new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return reply.status(400).send({ error: { code: "INVALID_RANGE", message: "Invalid time range." } });
    try {
      const result = await app.db.transaction().execute(async (trx: any) => {
        const existing = await trx.selectFrom("bookings").selectAll().where("student_id", "=", req.studentId).where("idempotency_key", "=", key).executeTakeFirst();
        if (existing) return { existing, repeated: true };
        const student = await trx.selectFrom("students").select(["suspended_until"]).where("student_id", "=", req.studentId).forUpdate().executeTakeFirst();
        const p = await app.policy.get(); validateNotSuspended(student?.suspended_until ? new Date(student.suspended_until) : null, now);
        const room = await trx.selectFrom("rooms").selectAll().where("room_id", "=", body.roomId).where("is_active", "=", true).executeTakeFirstOrThrow();
        validateBookingWindow({ policy: p, timeZone: "Africa/Lagos", now }, start, end, String(room.opens_at).slice(0, 5), String(room.closes_at).slice(0, 5));
        const week = startOfCampusWeek(start, "Africa/Lagos"); const next = new Date(week.getTime() + 7 * 86400000);
        const count = await trx.selectFrom("bookings").select(sql<number>`count(*)::int`.as("count")).where("student_id", "=", req.studentId).where("status", "!=", "CANCELLED").where(sql<boolean>`lower(during) >= ${week.toISOString()}::timestamptz AND lower(during) < ${next.toISOString()}::timestamptz`).executeTakeFirst();
        validateWeeklyLimit({ policy: p, timeZone: "Africa/Lagos", now }, Number(count?.count ?? 0));
        const duplicateRoom = await trx.selectFrom("bookings").select("booking_id").where("student_id", "=", req.studentId).where("room_id", "=", body.roomId).where("status", "in", ACTIVE as unknown as string[]).executeTakeFirst();
        if (duplicateRoom) throw Object.assign(new Error("You already have this room booked."), { code: "ALREADY_BOOKED_THIS_ROOM" });
        const inserted = await trx.insertInto("bookings").values({ room_id: body.roomId, student_id: req.studentId, during: sql`tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz)`, purpose: body.purpose ?? null, status: "CONFIRMED", idempotency_key: key }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto("booking_events").values({ booking_id: inserted.booking_id, from_status: null, to_status: "CONFIRMED", actor: req.studentId }).execute();
        return { existing: inserted, repeated: false };
      });
      return reply.status(result.repeated ? 200 : 201).send({ booking: result.existing });
    } catch (err: any) {
      const code = err.code === "23P01" ? "SLOT_TAKEN" : err.code === "23505" ? "SLOT_TAKEN" : err.code ?? "BOOKING_RULE_VIOLATION";
      return reply.status(code === "SUSPENDED" ? 403 : code === "SLOT_TAKEN" ? 409 : 422).send({ error: { code, message: err.message } });
    }
  });

  app.post("/bookings/:id/cancel", async (req, reply) => {
    const id = (req.params as any).id; const now = new Date();
    const b = await app.db.selectFrom("bookings").selectAll().where("booking_id", "=", id).where("student_id", "=", req.studentId).executeTakeFirst();
    if (!b) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    if (b.status !== "CONFIRMED") return reply.status(409).send({ error: { code: b.status === "CHECKED_IN" ? "ALREADY_STARTED" : "NOT_CANCELLABLE", message: "This booking can no longer be cancelled." } });
    const start = await app.db.selectNoFrom(sql`lower(tstzrange(${sql.val(b.during)}))`.as("start")).executeTakeFirst().catch(() => null);
    if (start && new Date((start as any).start) <= now) return reply.status(409).send({ error: { code: "ALREADY_STARTED", message: "This booking has already started." } });
    await app.db.transaction().execute(async (trx: any) => { await trx.updateTable("bookings").set({ status: "CANCELLED", cancelled_at: now }).where("booking_id", "=", id).execute(); await trx.insertInto("booking_events").values({ booking_id: id, from_status: "CONFIRMED", to_status: "CANCELLED", actor: req.studentId }).execute(); });
    return { booking: { ...b, status: "CANCELLED", cancelledAt: now.toISOString() } };
  });

  app.post("/bookings/:id/check-in", async (req, reply) => {
    const id = (req.params as any).id; const b: any = await app.db.selectFrom("bookings").selectAll().where("booking_id", "=", id).where("student_id", "=", req.studentId).executeTakeFirst();
    if (!b) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    const start = new Date((await app.db.selectFrom("bookings").select(sql<string>`lower(during)`.as("start")).where("booking_id", "=", id).executeTakeFirstOrThrow()).start); const now = new Date(); const p = await app.policy.get();
    if (b.status === "CHECKED_IN") return { booking: b };
    if (b.status !== "CONFIRMED") return reply.status(409).send({ error: { code: b.status === "NO_SHOW" ? "RELEASED" : "NOT_ACTIVE", message: "This booking is not active." } });
    if (now < new Date(start.getTime() - p.checkin_opens_before_start_minutes * 60000)) return reply.status(409).send({ error: { code: "TOO_EARLY", message: "Check-in opens 10 minutes before your booking." } });
    if (now > new Date(start.getTime() + p.checkin_closes_after_start_minutes * 60000)) return reply.status(409).send({ error: { code: "RELEASED", message: "This booking was released." } });
    const updated = await app.db.updateTable("bookings").set({ status: "CHECKED_IN", checked_in_at: now }).where("booking_id", "=", id).execute();
    return { booking: { ...b, status: "CHECKED_IN", checkedInAt: now.toISOString() } };
  });
};
