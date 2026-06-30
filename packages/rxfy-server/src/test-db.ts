import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

/** A fresh, isolated in-memory Postgres + drizzle db with `createTableSql` applied. */
export async function createTestDb(createTableSql: string): Promise<{ db: PgliteDatabase; client: PGlite }> {
  const client = new PGlite(); // in-memory, isolated per call
  const db = drizzle(client);
  await client.exec(createTableSql);
  return { db, client };
}
