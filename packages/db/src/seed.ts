import { db } from "./db.js";

/**
 * Seeds the facilities catalogue (A2). Real data comes from the facilities
 * import; this provides a dev dataset so search/booking work out of the box.
 * Idempotent: re-running upserts by primary key.
 *
 * Coordinates below are a made-up campus layout near Lagos; replace with
 * real values from the facilities extract in ops/import.
 */

const buildings = [
  { building_id: "ENG", name: "Engineering", zone: "north", latitude: 6.5180, longitude: 3.3870 },
  { building_id: "LIB", name: "Central Library", zone: "central", latitude: 6.5195, longitude: 3.3890 },
  { building_id: "SCI", name: "Science Building", zone: "north", latitude: 6.5185, longitude: 3.3875 },
  { building_id: "ART", name: "Arts Building", zone: "south", latitude: 6.5210, longitude: 3.3865 },
  { building_id: "BIZ", name: "Business School", zone: "south", latitude: 6.5215, longitude: 3.3885 },
];

const amenities = [
  { amenity_id: "white", name: "Whiteboard" },
  { amenity_id: "proj", name: "Projector" },
  { amenity_id: "access", name: "Step-free access" },
  { amenity_id: "quiet", name: "Quiet zone" },
  { amenity_id: "wifi", name: "Wi-Fi" },
  { amenity_id: "power", name: "Power sockets" },
  { amenity_id: "ac", name: "Air conditioning" },
  { amenity_id: "screen", name: "Large screen" },
  { amenity_id: "rec", name: "Recording equipment" },
];

type RoomRow = {
  room_id: string; // deterministic UUID-like strings for stable reseeding
  code: string;
  building_id: string;
  name: string;
  type: string;
  capacity: number;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  amenity_ids: string[];
};

const rooms: RoomRow[] = [];
const opens = "07:00";
const closes = "22:00";
let n = 0;

function pushRoom(
  building: string,
  code: string,
  name: string,
  type: "study" | "seminar" | "other",
  capacity: number,
  am: string[]
) {
  n++;
  // Keep this fixture range separate from the original seed so the importer
  // can upgrade an existing development database without primary-key clashes.
  const room_id = `00000000-0000-4000-8000-${String(900000000000 + n).slice(-12)}`;
  rooms.push({
    room_id,
    code,
    building_id: building,
    name,
    type,
    capacity,
    opens_at: opens,
    closes_at: closes,
    is_active: true,
    amenity_ids: am,
  });
}

// Featured design rooms first so they appear at the top of default searches:
pushRoom("ENG", "ENG-201", "Engineering · Level 2", "study", 8, ["white", "proj", "wifi", "power"]);
pushRoom("LIB", "LIB-104", "Central Library · Level 1", "study", 4, ["white", "quiet", "wifi", "power"]);
pushRoom("SCI", "SCI-302", "Science Building · Level 3", "seminar", 12, ["proj", "access", "wifi", "ac"]);
pushRoom("ART", "ART-106", "Arts Building · Level 1", "study", 6, ["white", "access", "wifi", "power"]);
pushRoom("BIZ", "BIZ-204", "Business School · Level 2", "seminar", 16, ["white", "proj", "screen", "access", "wifi"]);
pushRoom("ENG", "ENG-105", "Engineering · Level 1", "study", 6, ["white", "access", "wifi", "power"]);

function addRooms(building: string, buildingLabel: string, prefix: string, startCode: number, type: "study" | "seminar" | "other", count: number, caps: number[], am: string[]) {
  for (let i = 0; i < count; i++) {
    const num = startCode + i;
    const code = `${prefix}-${num}`;
    if (rooms.some((r) => r.code === code)) continue;
    const cap = caps[i % caps.length]!;
    const level = Math.floor(num / 100);
    pushRoom(building, code, `${buildingLabel} · Level ${level}`, type, cap, am);
  }
}

addRooms("ENG", "Engineering", "ENG", 202, "study", 45, [4, 6, 8], ["white", "proj", "wifi", "power", "ac"]);
addRooms("ENG", "Engineering", "ENG", 301, "seminar", 20, [12, 20, 30], ["proj", "white", "screen", "access", "wifi"]);
addRooms("LIB", "Central Library", "LIB", 101, "study", 65, [2, 4, 6, 8], ["white", "quiet", "access", "wifi", "power"]);
addRooms("LIB", "Central Library", "LIB", 201, "other", 15, [1, 2, 4], ["quiet", "wifi", "power"]);
addRooms("SCI", "Science Building", "SCI", 201, "study", 45, [4, 6, 8, 10], ["white", "proj", "wifi", "power"]);
addRooms("SCI", "Science Building", "SCI", 301, "seminar", 20, [12, 18, 24], ["proj", "access", "screen", "wifi", "ac"]);
addRooms("ART", "Arts Building", "ART", 101, "study", 30, [4, 6, 8], ["white", "access", "wifi", "power"]);
addRooms("ART", "Arts Building", "ART", 201, "seminar", 15, [15, 25], ["proj", "rec", "screen", "wifi"]);
addRooms("BIZ", "Business School", "BIZ", 101, "study", 25, [4, 6, 8], ["white", "proj", "wifi", "power", "ac"]);
addRooms("BIZ", "Business School", "BIZ", 201, "seminar", 20, [12, 20, 40], ["proj", "white", "screen", "access", "wifi", "ac"]);

const defaultStudents = [
  { student_id: "s123", email: "ayo.okonkwo@campus.edu.ng", display_name: "Ayo Okonkwo" },
  { student_id: "s456", email: "chidi.nwosu@campus.edu.ng", display_name: "Chidi Nwosu" },
];

/*
 * Target scale in the brief is ~300 rooms; this seed creates ~120.
 * To scale up, rerun ops/import against the real facilities extract.
 */

async function seed() {
  for (const b of buildings) {
    await db
      .insertInto("buildings")
      .values(b)
      .onConflict((oc) =>
        oc.column("building_id").doUpdateSet({
          name: b.name, zone: b.zone, latitude: b.latitude, longitude: b.longitude,
        })
      )
      .execute();
  }

  for (const a of amenities) {
    await db
      .insertInto("amenities")
      .values(a)
      .onConflict((oc) => oc.column("amenity_id").doUpdateSet({ name: a.name }))
      .execute();
  }

  for (const s of defaultStudents) {
    await db
      .insertInto("students")
      .values(s)
      .onConflict((oc) =>
        oc.column("student_id").doUpdateSet({
          email: s.email,
          display_name: s.display_name,
        })
      )
      .execute();
  }

  for (const r of rooms) {
    const { amenity_ids, ...roomInsert } = r;
    await db
      .insertInto("rooms")
      .values(roomInsert)
      .onConflict((oc) =>
        oc.column("code").doUpdateSet({
          building_id: roomInsert.building_id,
          name: roomInsert.name,
          type: roomInsert.type,
          capacity: roomInsert.capacity,
          opens_at: roomInsert.opens_at,
          closes_at: roomInsert.closes_at,
          is_active: roomInsert.is_active,
        })
      )
      .execute();

    // look up the actual room_id by the immutable code (facilities never
    // changes it), so amenity links always reference a row that exists.
    const room = await db
      .selectFrom("rooms")
      .select("room_id")
      .where("code", "=", roomInsert.code)
      .executeTakeFirstOrThrow();

    for (const amenity_id of amenity_ids) {
      await db
        .insertInto("room_amenities")
        .values({ room_id: room.room_id, amenity_id })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }

  console.log(`seeded ${buildings.length} buildings, ${amenities.length} amenities, ${rooms.length} rooms`);
}

await seed();
await db.destroy();
