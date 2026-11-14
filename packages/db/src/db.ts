import { createDb } from "./kysely.js";

const connectionString =
  process.env.DATABASE_URL || "postgres://crs:crs@localhost:55432/crs";

/** Used only by tsx scripts. The app itself imports `client.ts` instead. */
export const db = createDb(connectionString);

