/** Error codes used by the booking rules. The API maps these to HTTP codes. */
export type BookingRuleErrorCode =
  | "NOT_ON_GRID"
  | "DURATION_TOO_SHORT"
  | "DURATION_TOO_LONG"
  | "BEYOND_HORIZON"
  | "OUTSIDE_OPENING_HOURS"
  | "IN_PAST"
  | "END_NOT_AFTER_START"
  | "WEEKLY_LIMIT_REACHED"
  | "SUSPENDED";

export class BookingRuleError extends Error {
  readonly code: BookingRuleErrorCode;
  constructor(code: BookingRuleErrorCode, message: string) {
    super(message);
    this.name = "BookingRuleError";
    this.code = code;
  }
}
