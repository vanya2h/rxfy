import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { todos } from "../src/db/schema.js";

const globalForPglite = globalThis as unknown as { __rxfyPglite?: PGlite };
const client = (globalForPglite.__rxfyPglite ??= new PGlite());
export const db = drizzle(client);

const DDL = `
  CREATE TABLE todos (
    id text PRIMARY KEY,
    title text NOT NULL,
    done boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  );
`;

let ready: Promise<void> | undefined;

/** Create tables + seed once. Idempotent (awaited by the server before handling requests). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.exec(DDL);
      await db.insert(todos).values([
        { id: "t1", title: "Open this app in a second tab", done: false },
        { id: "t2", title: "Toggle me — the other tab updates instantly", done: false },
        { id: "t3", title: "Add a todo — the other tab shows a refresh badge", done: false },
      ]);
    })();
  }
  return ready;
}

export { todos };
