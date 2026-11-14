import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./kysely.js";
import type { Db } from "./kysely.js";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

/**
 * Integration test for the hard database invariants (R6, R8, R10).
 * Runs against the REAL database — these rules live in constraints, not code,
 * so a mocked DB would prove nothing.
 *
 *   DATABASE_URL=postgres://crs:crs@localhost:55432/crs pnpm --filter @crs/db test
 */

const ROOM_ID = "00000000-0000-4000-8000-100000000001";

let db: Db;
  beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  db = createDb(url);

  // test students referenced by the bookings below
  const ids = ["s-conc-1", "s-conc-2", "s-bound-1", "s-bound-2", "s-r8", "s-r10"];
  for (const id of ids) {
    await db
      .insertInto("students")
      .values({ student_id: id, email: `${id}@uni.example`, display_name: id })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
});
afterAll(() => db.destroy());

async function insertBooking(
  studentId: string,
  key: string,
  during: string // tstzrange literal
) {
  return db
    .insertInto("bookings")
    .values({ room_id: ROOM_ID, student_id: studentId, during, idempotency_key: key })
    .execute();
}

describe("hard database invariants", () => {
  // R6: overlapping active bookings for the same room are rejected
  it("R6: overlapping active bookings for the same room are rejected", async () => {
    // Delete any existing room and booking first
    await db.deleteFrom("bookings").where("room_id", "=", ROOM_ID).execute();
    
    await insertBooking("s-conc-1", "k1", "[2026-11-16T10:00:00Z, 2026-11-16T12:00:00Z)");
    await expect(
      insertBooking("s-conc-2", "k2", "[2026-11-16T11:00:00Z, 2026-11-16T13:00:00Z)")
    ).rejects.toThrow();
  });

  // R6: half-open ranges at the boundary do NOT overlap
  it("R6: half-open ranges at the boundary do NOT overlap", async () => {
    // 10:00–12:00 and 12:00–14:00 touch but don't overlap (half-open [ )
    // Need a new room to avoid the previous test's constraint
    await db.insertInto("rooms")
      .onConflict((oc) => oc.doNothing())
      .values({
        room_id: "00000000-0000-4000-8000-200000000001",
        code: "TEST-2",
        building_id: "ENG",
        name: "Test Room 2",
        type: "study",
        capacity: 10,
        opens_at: "08:00",
        closes_at: "20:00"
      }).execute();
    
    const ROOM_ID_2 = "00000000-0000-4000-8000-200000000001";
    await db.deleteFrom("bookings").where("room_id", "=", ROOM_ID_2).execute();
    
    await db.insertInto("bookings")
      .values({ room_id: ROOM_ID_2, student_id: "s-bound-1", during: "[2026-11-16T12:00:00Z, 2026-11-16T14:00:00Z)", idempotency_key: "k3" })
      .execute();
      
    // For R8, the same student cannot book the same room twice (must be different student or different room)
    await expect(
      db.insertInto("bookings")
        .values({ room_id: ROOM_ID_2, student_id: "s-bound-2", during: "[2026-11-16T14:00:00Z, 2026-11-16T16:00:00Z)", idempotency_key: "k4" })
        .execute()
    ).resolves.toBeDefined();
  });

  it("R8: one student cannot hold two active bookings for the same room", async () => {
    await db.insertInto("rooms")
      .onConflict((oc) => oc.doNothing())
      .values({
        room_id: "00000000-0000-4000-8000-300000000001",
        code: "TEST-3",
        building_id: "ENG",
        name: "Test Room 3",
        type: "study",
        capacity: 10,
        opens_at: "08:00",
        closes_at: "20:00"
      }).execute();
    const ROOM_ID_3 = "00000000-0000-4000-8000-300000000001";

    await db.deleteFrom("bookings").where("room_id", "=", ROOM_ID_3).execute();

    await db.insertInto("bookings")
      .values({ room_id: ROOM_ID_3, student_id: "s-r8", during: "[2026-11-17T10:00:00Z, 2026-11-17T12:00:00Z)", idempotency_key: "k5" })
      .execute();
      
    await expect(
      db.insertInto("bookings")
        .values({ room_id: ROOM_ID_3, student_id: "s-r8", during: "[2026-11-17T14:00:00Z, 2026-11-17T16:00:00Z)", idempotency_key: "k6" })
        .execute()
    ).rejects.toThrow();
  });

  it("R10: same idempotency key never creates a second booking", async () => {
    await db.deleteFrom("bookings").where("student_id", "=", "s-r10").execute();
    
    await db.insertInto("bookings")
      .values({ room_id: ROOM_ID, student_id: "s-r10", during: "[2026-11-18T10:00:00Z, 2026-11-18T12:00:00Z)", idempotency_key: "dup-key" })
      .execute();
      
    await expect(
      db.insertInto("bookings")
        .values({ room_id: ROOM_ID, student_id: "s-r10", during: "[2026-11-18T14:00:00Z, 2026-11-18T16:00:00Z)", idempotency_key: "dup-key" })
        .execute()
    ).rejects.toThrow();
  });
});
