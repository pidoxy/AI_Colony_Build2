import { sql, type Migration, type MigrationProvider } from "kysely";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations"
);

/**
 * Loads migrations/*.sql (sorted by filename).
 * Each file is applied inside its own transaction; files must NOT be edited
 * after being merged — add a new file instead (0002_....sql, ...).
 */
export class SqlFileMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      const sqlText = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      migrations[file.replace(/\.sql$/, "")] = {
        async up(db) {
          await sql.raw(sqlText).execute(db);
        },
      };
    }
    return migrations;
  }
}
