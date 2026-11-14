import { z } from "zod";

/**
 * Single source of truth for environment configuration.
 * All services import from here; nothing else touches process.env.
 * Fails fast on boot if anything required is missing.
 */

const TimeZone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "CAMPUS_TZ must be a valid IANA time zone (assumption A3: one campus zone)" }
);

const OptionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().url().optional()
);

export const Config = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .startsWith("postgres")
    .default("postgres://crs:crs@localhost:55432/crs"),
  CAMPUS_TZ: TimeZone.default("Africa/Lagos"),

  AUTH_MODE: z.enum(["dev", "sso"]).default("dev"),
  SSO_ISSUER: OptionalUrl,
  SSO_JWKS_URI: OptionalUrl,

  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),

  SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  DISPATCH_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),

  NOTIFICATION_ADAPTER: z.enum(["log"]).default("log"),
});
export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Config.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment config:\n${issues}`);
  }
  return result.data;
}
