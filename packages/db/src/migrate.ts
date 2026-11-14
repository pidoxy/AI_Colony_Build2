import { Migrator } from "kysely";
import { createDb } from "./kysely.js";
import { SqlFileMigrationProvider } from "./migrator.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url);
const migrator = new Migrator({ db, provider: new SqlFileMigrationProvider() });

const { error, results } = await migrator.migrateToLatest();

for (const r of results ?? []) {
  console.log(`${r.status === "Success" ? "✓" : "✗"} ${r.migrationName}: ${r.status}`);
}

await db.destroy();

if (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
