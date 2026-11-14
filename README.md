# Classroom Reservation System

A university room booking system featuring strict database-level overlap guarantees, 
idempotent booking, and no-show sweeps.

## Getting Started

1. **Prerequisites**: Node.js v20+, Docker Desktop.
2. **Setup**:
   ```bash
   pnpm install
   pnpm db:up         # Starts Postgres (mapped to port 55432)
   pnpm db:migrate    # Runs migrations (0001_init)
   pnpm db:codegen    # Generates Kysely types
   pnpm import:rooms  # Seeds sample data
   ```
3. **Run**:
   ```bash
   pnpm dev           # Starts API + Web (Turbo)
   ```

## Key Rules (Enforced in DB)
- **Overlap (R6)**: `EXCLUDE USING gist (room_id, during)` prevents overlapping bookings.
- **Single Booking (R8)**: Partial index on active bookings per student/room.
- **Idempotency (R10)**: Unique constraint on `(student_id, idempotency_key)`.

## Dev Tips
- `.env` uses `DATABASE_URL=postgres://crs:crs@localhost:55432/crs`.
- `pnpm db:psql` opens a terminal to the container.
- `apps/worker` runs sweeps independently: `pnpm --filter @crs/worker dev`.
