import { createDb, type Db } from "./kysely.js";

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    db = createDb(url);
  }
  return db;
}

/** For tests/scripts that need an isolated connection. */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = undefined;
  }
}
