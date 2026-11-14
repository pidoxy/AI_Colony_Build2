-- 0001_init.sql
-- Classroom Reservation System — initial schema.
-- Availability is DERIVED (opening hours minus active bookings); it is never stored.
-- Safety invariants live here, in the database, so no application bug can double-book a room.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- required for EXCLUDE (uuid WITH =, range WITH &&)

-- ─────────────────────────── enum ───────────────────────────
CREATE TYPE booking_status AS ENUM
  ('CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'COMPLETED');
-- "Active" = CONFIRMED or CHECKED_IN. Used in every partial index below.

-- ─────────────────── imported / SSO-sourced ─────────────────
CREATE TABLE students (
  student_id      text PRIMARY KEY,          -- from SSO token (never from request bodies)
  email           text NOT NULL,
  display_name    text NOT NULL,
  suspended_until timestamptz,               -- NULL = not suspended
  first_seen_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE buildings (
  building_id text PRIMARY KEY,              -- from facilities import
  name        text NOT NULL,
  zone        text,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL
);

CREATE TABLE rooms (
  room_id     uuid PRIMARY KEY,              -- from facilities import
  code        text NOT NULL UNIQUE,          -- e.g. ENG-201
  building_id text NOT NULL REFERENCES buildings,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('study','seminar','other')),
  capacity    int  NOT NULL CHECK (capacity > 0),
  opens_at    time NOT NULL,                 -- campus local wall-clock
  closes_at   time NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);
CREATE INDEX rooms_filter_idx ON rooms (type, capacity, building_id) WHERE is_active;

CREATE TABLE amenities (
  amenity_id text PRIMARY KEY,               -- from import
  name       text NOT NULL UNIQUE
);

CREATE TABLE room_amenities (
  room_id    uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
  amenity_id text NOT NULL REFERENCES amenities ON DELETE CASCADE,
  PRIMARY KEY (room_id, amenity_id)
);

-- ─────────────────────── the core table ─────────────────────
CREATE TABLE bookings (
  booking_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- service-made
  room_id         uuid NOT NULL REFERENCES rooms,
  student_id      text NOT NULL REFERENCES students,
  during          tstzrange NOT NULL,          -- half-open [start, end)
  purpose         text,
  status          booking_status NOT NULL DEFAULT 'CONFIRMED',
  idempotency_key text NOT NULL,               -- the ONE id the client invents
  checked_in_at   timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT during_not_empty CHECK (NOT isempty(during)),
  CONSTRAINT during_bounded   CHECK (lower(during) IS NOT NULL AND upper(during) IS NOT NULL),

  -- R6: zero-tolerance no-overlap. Holds under ANY concurrency, at commit time.
  CONSTRAINT no_overlapping_active_bookings EXCLUDE USING gist (
    room_id WITH =,
    during  WITH &&
  ) WHERE (status IN ('CONFIRMED','CHECKED_IN')),

  -- R10: one booking per (student, idempotency key) — the race-proof backstop
  CONSTRAINT one_booking_per_idem_key UNIQUE (student_id, idempotency_key)
);

-- R8: at most one active booking per student per room
CREATE UNIQUE INDEX one_active_booking_per_student_room
  ON bookings (student_id, room_id)
  WHERE status IN ('CONFIRMED','CHECKED_IN');

-- The GiST index backing the EXCLUDE constraint doubles as the search anti-join index.

-- R4: student's own upcoming bookings
CREATE INDEX bookings_student_upcoming_idx
  ON bookings (student_id, lower(during))
  WHERE status IN ('CONFIRMED','CHECKED_IN');

-- R13 worker: no-show sweep over CONFIRMED bookings by start time
CREATE INDEX bookings_noshow_sweep_idx
  ON bookings (lower(during)) WHERE status = 'CONFIRMED';

-- Worker: completion sweep over CHECKED_IN bookings by end time
CREATE INDEX bookings_completion_sweep_idx
  ON bookings (upper(during)) WHERE status = 'CHECKED_IN';

-- R9 weekly limit count + R4 standing
CREATE INDEX bookings_student_created_idx ON bookings (student_id, created_at);

-- R14 "Just released"
CREATE INDEX bookings_just_released_idx
  ON bookings (cancelled_at) WHERE status = 'CANCELLED';

-- ─────────────────────── audit trail ────────────────────────
CREATE TABLE booking_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES bookings,
  from_status booking_status,                  -- NULL on creation
  to_status   booking_status NOT NULL,
  actor       text NOT NULL,                   -- student_id, or 'system', or 'worker'
  reason      text,                            -- e.g. 'room deactivated'
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_events_booking_idx ON booking_events (booking_id);
-- R14: no-show releases are found via events (to_status = 'NO_SHOW')

-- ─────────────────────── penalties (R15) ────────────────────
CREATE TABLE penalties (
  penalty_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES students,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings,   -- at most one per booking
  kind       text NOT NULL CHECK (kind = 'no_show'),
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX penalties_student_recent_idx ON penalties (student_id, at);

-- ─────────────────── notification outbox (R16–R18) ──────────
CREATE TABLE notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      text NOT NULL REFERENCES students,
  booking_id      uuid REFERENCES bookings,              -- NULL for announcements
  type            text NOT NULL CHECK (type IN
                    ('confirmed','cancelled','no_show_released','suspension',
                     'reminder','downtime')),
  send_at         timestamptz NOT NULL,                  -- now, or start − reminder_minutes
  sent_at         timestamptz,                           -- NULL = pending
  attempts        int  NOT NULL DEFAULT 0,
  dedupe_key      text NOT NULL UNIQUE                   -- e.g. 'reminder:<booking_id>'
);
CREATE INDEX notifications_pending_idx
  ON notifications (send_at) WHERE sent_at IS NULL;

-- ─────────────────── announcements (R18) ────────────────────
CREATE TABLE announcements (
  announcement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  message     text NOT NULL,
  CHECK (ends_at > starts_at)
);

-- ─────────────────── policy table (R20) ─────────────────────
-- Every bracketed policy value lives here. Services cache for max 30s (fail-open)
-- and must fail their operation if no snapshot exists and the DB is unreachable
-- (fail-closed on booking; booking limits must never be elastic).
CREATE TABLE policy (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text
);

INSERT INTO policy (key, value, description) VALUES
  ('search_max_staleness_seconds',       '5',   'R2  max age of served search results'),
  ('available_soon_window_hours',        '2',   'R3  rooms free now or within this window'),
  ('slot_grid_minutes',                  '30',  'R5  start/end must fall on this grid'),
  ('min_duration_minutes',               '30',  'R5  minimum booking duration'),
  ('max_duration_minutes',               '180', 'R5  maximum booking duration (3 h)'),
  ('max_booking_horizon_days',           '14',  'R5  how far ahead a booking may start'),
  ('weekly_booking_limit',               '5',   'R9  max bookings per calendar week (Mon–Sun campus time); cancelled excluded, no-shows included'),
  ('checkin_opens_before_start_minutes', '10',  'R12 check-in window opens this long before start'),
  ('checkin_closes_after_start_minutes', '15',  'R12/R13 check-in window closes, and no-show releases, this long after start'),
  ('just_released_window_hours',         '2',   'R14 how long released slots stay on the Just released list'),
  ('noshow_window_days',                 '30',  'R15 rolling window for counting no-shows'),
  ('noshow_suspension_threshold',        '3',   'R15 no-shows in the window that trigger suspension'),
  ('suspension_days',                    '7',   'R15 suspension length'),
  ('reminder_minutes_before_start',      '60',  'R17 reminder lead time (allowed range 30–60)');

COMMIT;
