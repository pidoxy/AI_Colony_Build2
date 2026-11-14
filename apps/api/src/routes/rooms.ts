import { type FastifyPluginAsync } from "fastify";
import { sql } from "kysely";

const ACTIVE = ["CONFIRMED", "CHECKED_IN"] as const;

export const roomRoutes: FastifyPluginAsync = async (app) => {
  app.get("/search", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const start = q.start;
    const end = q.end;
    if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
      return reply.status(400).send({ error: { code: "INVALID_RANGE", message: "Choose a valid start and end time." } });
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate <= startDate) return reply.status(400).send({ error: { code: "INVALID_RANGE", message: "End time must be after start time." } });
    const p = await app.policy.get();
    const duration = (endDate.getTime() - startDate.getTime()) / 60000;
    if (duration < p.min_duration_minutes || duration > p.max_duration_minutes) {
      return reply.status(400).send({ error: { code: "INVALID_RANGE", message: `Bookings are ${p.min_duration_minutes} minutes to ${p.max_duration_minutes / 60} hours.` } });
    }
    const minCapacity = q.min_capacity ?? q.minCapacity;
    const type = q.type;
    const name = q.name;
    const building = q.near_building ?? q.building_id ?? q.buildingId;
    const amenities = (q.amenities ?? "").split(",").map((x) => x.trim()).filter(Boolean);

    let query: any = app.db
      .selectFrom("rooms")
      .innerJoin("buildings", "buildings.building_id", "rooms.building_id")
      .select([
        "rooms.room_id as roomId", "rooms.code", "rooms.name", "rooms.building_id as buildingId",
        "buildings.name as buildingName", "rooms.capacity", "rooms.type", "rooms.opens_at as opensAt", "rooms.closes_at as closesAt",
      ])
      .where("rooms.is_active", "=", true)
      .where((eb: any) => eb.not(eb.exists(eb.selectFrom("bookings")
        .select("booking_id")
        .whereRef("bookings.room_id", "=", "rooms.room_id")
        .where("bookings.status", "in", ACTIVE as unknown as string[])
        .where(sql<boolean>`during && tstzrange(${sql.val(startDate.toISOString())}::timestamptz, ${sql.val(endDate.toISOString())}::timestamptz)`))));
    if (minCapacity) query = query.where("rooms.capacity", ">=", Number(minCapacity));
    if (type && ["study", "seminar", "other"].includes(type)) query = query.where("rooms.type", "=", type);
    if (name) query = query.where((eb: any) => eb.or([eb("rooms.code", "ilike", `%${name}%`), eb("rooms.name", "ilike", `%${name}%`)]));
    if (building) query = query.where("rooms.building_id", "=", building);
    const rows = await query.orderBy("rooms.code").execute();
    const roomIds = rows.map((r: any) => r.roomId);
    const amenityRows = roomIds.length ? await app.db.selectFrom("room_amenities").innerJoin("amenities", "amenities.amenity_id", "room_amenities.amenity_id").select(["room_amenities.room_id as roomId", "amenities.name"]).where("room_amenities.room_id", "in", roomIds).execute() : [];
    const result = rows.map((r: any) => ({ ...r, amenities: amenityRows.filter((a: any) => a.roomId === r.roomId).map((a: any) => a.name) }));
    const wanted = amenities.map((x) => x.toLowerCase());
    const filtered = wanted.length ? result.filter((r: any) => wanted.every((w) => r.amenities.some((a: string) => a.toLowerCase().includes(w)))) : result;
    return { rooms: filtered, asOf: new Date().toISOString() };
  });

  app.get("/available-soon", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const now = new Date();
    const until = new Date(now.getTime() + Math.min(Number(q.within ?? 120), 120) * 60000);
    const rows = await app.db.selectFrom("rooms").innerJoin("buildings", "buildings.building_id", "rooms.building_id").select(["rooms.room_id as roomId", "rooms.code", "rooms.name", "rooms.capacity", "rooms.type", "buildings.name as buildingName"]).where("rooms.is_active", "=", true).where((eb: any) => eb.not(eb.exists(eb.selectFrom("bookings").select("booking_id").whereRef("bookings.room_id", "=", "rooms.room_id").where("bookings.status", "in", ACTIVE as unknown as string[]).where(sql<boolean>`during && tstzrange(${sql.val(now.toISOString())}::timestamptz, ${sql.val(until.toISOString())}::timestamptz)`)))).orderBy("rooms.code").execute();
    return { rooms: rows, asOf: new Date().toISOString() };
  });

  app.get("/released", async () => ({ rooms: [], asOf: new Date().toISOString() }));
};
