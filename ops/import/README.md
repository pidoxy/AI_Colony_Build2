# Facilities import (A2)

The room, building and amenity catalogue comes from the university facilities
system and is loaded by **import only** — there is no editing UI.

## What to do

1. Obtain the facilities extract (CSV or JSON) with columns:
   - buildings: `building_id, name, zone, latitude, longitude`
   - rooms: `room_id, code, building_id, name, type, capacity, opens_at, closes_at, is_active`
   - amenities: `amenity_id, name`
   - room_amenities: `room_id, amenity_id`
2. Put the files in this directory.
3. Run the importer (TODO — will map extract → upserts like `packages/db/src/seed.ts`).

Until the importer is written, the dev seed in `packages/db` fills the same
tables with sample data so search/booking work end to end.

## Notes

- Deactivating a room (`is_active=false`) also cancels its future bookings in
  the same transaction (actor `system`, reason recorded) and writes cancellation
  notifications — that logic lives in the API/worker, not here.
- Re-running an import upserts by the facilities ids; it is idempotent.
