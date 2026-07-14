import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { todos } from "../db/schema";

// One PGlite instance + one init promise per process, shared across bundles via globalThis.
const globalForDb = globalThis as unknown as { __rxfyPglite?: PGlite; __rxfyDbReady?: Promise<void> };
const client = (globalForDb.__rxfyPglite ??= new PGlite());
export const db = drizzle(client);

const DDL = `
  CREATE TABLE IF NOT EXISTS todos (
    id text PRIMARY KEY,
    title text NOT NULL,
    done boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  );
`;

/** Create tables + seed once. Idempotent (safe if called from both the server and a route handler). */
export function initDb(): Promise<void> {
  return (globalForDb.__rxfyDbReady ??= (async () => {
    await client.exec(DDL);
    const existing = await db.select().from(todos).limit(1);
    if (existing.length > 0) return;
    await db.insert(todos).values([
      { id: "t1", title: "Open this app in a second tab", done: false },
      { id: "t2", title: "Toggle me — the other tab updates instantly", done: false },
      { id: "t3", title: "Add a todo — the other tab shows a refresh badge", done: false },
    ]);
  })());
}

export { todos };
