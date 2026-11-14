import { z } from "zod";

// ── enums ─────────────────────────────────────────────────────
export const RoomType = z.enum(["study", "seminar", "other"]);
export type RoomType = z.infer<typeof RoomType>;

export const BookingStatus = z.enum([
  "CONFIRMED",
  "CHECKED_IN",
  "CANCELLED",
  "NO_SHOW",
  "COMPLETED",
]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const NotificationType = z.enum([
  "confirmed",
  "cancelled",
  "no_show_released",
  "suspension",
  "reminder",
  "downtime",
]);
export type NotificationType = z.infer<typeof NotificationType>;

// ── shared shapes ─────────────────────────────────────────────
export interface Room {
  roomId: string;
  code: string;
  buildingId: string;
  buildingName: string;
  name: string;
  type: RoomType;
  capacity: number;
  opensAt: string; // "HH:MM"
  closesAt: string;
  amenities: string[];
  distanceMeters?: number; // only when a proximity filter was applied
}

export interface AvailabilitySlot {
  start: string; // ISO 8601 UTC
  end: string;
}

export interface Booking {
  bookingId: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  during: AvailabilitySlot;
  purpose: string | null;
  status: BookingStatus;
  checkedInAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface BookingEvent {
  eventId: number;
  bookingId: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actor: string;
  reason: string | null;
  at: string;
}

export interface Announcement {
  announcementId: string;
  startsAt: string;
  endsAt: string;
  message: string;
}

// ── POST /bookings ────────────────────────────────────────────
export const CreateBookingRequest = z.object({
  roomId: z.string().uuid(),
  start: z.string().datetime({ offset: false, message: "start must be an ISO 8601 UTC datetime" }),
  end: z.string().datetime({ offset: false, message: "end must be an ISO 8601 UTC datetime" }),
  purpose: z.string().max(500).optional(),
});
export type CreateBookingRequest = z.infer<typeof CreateBookingRequest>;

export const IdempotencyKeyHeader = "idempotency-key";

// ── GET /rooms/search ─────────────────────────────────────────
export const SearchRoomsQuery = z.object({
  start: z.string().datetime({ offset: false }),
  end: z.string().datetime({ offset: false }),
  minCapacity: z.coerce.number().int().positive().optional(),
  type: RoomType.optional(),
  name: z.string().max(120).optional(),
  purpose: z.string().max(120).optional(),
  buildingId: z.string().optional(),
  amenities: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined)),
  durationMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
});
export type SearchRoomsQuery = z.infer<typeof SearchRoomsQuery>;

// ── GET /rooms/available-soon ─────────────────────────────────
export const AvailableSoonQuery = z.object({
  minCapacity: z.coerce.number().int().positive().optional(),
  type: RoomType.optional(),
});
export type AvailableSoonQuery = z.infer<typeof AvailableSoonQuery>;

// ── GET /me/standing ──────────────────────────────────────────
export interface Standing {
  studentId: string;
  displayName: string;
  email: string;
  suspendedUntil: string | null;
  bookingsUsedThisWeek: number;
  weeklyBookingLimit: number;
  noShowsInRollingWindow: number;
}

// ── error shape ───────────────────────────────────────────────
export const ApiErrorCode = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "ROOM_UNAVAILABLE",
  "BOOKING_RULE_VIOLATION",
  "SUSPENDED",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export interface ApiError {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
