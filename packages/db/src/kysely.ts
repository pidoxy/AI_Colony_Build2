import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./generated/schema.js";

export type Db = Kysely<DB>;

export function createDb(connectionString: string): Db {
  const dialect = new PostgresDialect({
    pool: new pg.Pool({ connectionString }),
  });
  return new Kysely<DB>({ dialect });
}
