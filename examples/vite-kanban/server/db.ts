import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateNKeysBetween } from "fractional-indexing";
import { cards } from "../src/db/schema.js";
import type { ColumnId } from "../src/kanban/models.js";

const globalForPglite = globalThis as unknown as { __kanbanPglite?: PGlite };
const client = (globalForPglite.__kanbanPglite ??= new PGlite());
export const db = drizzle(client);

const DDL = `
  CREATE TABLE cards (
    id text PRIMARY KEY,
    column_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    position text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  );
`;

/** Column → seed card titles (oldest first). */
const SEED: Record<ColumnId, { title: string; description: string }[]> = {
  todo: [
    { title: "Draft the roadmap", description: "Outline Q3 goals and milestones." },
    { title: "Design the landing page", description: "" },
    { title: "Set up CI", description: "GitHub Actions for lint + test." },
  ],
  doing: [
    { title: "Wire the sync layer", description: "patch on move, stale on create/delete." },
    { title: "Write the drag interactions", description: "dnd-kit + fractional positions." },
  ],
  done: [{ title: "Scaffold the repo", description: "Vite SSR + Hono + PGlite." }],
};

let ready: Promise<void> | undefined;

/** Create tables + seed once. Idempotent (awaited by the server before handling requests). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.exec(DDL);
      const rows: (typeof cards.$inferInsert)[] = [];
      for (const columnId of Object.keys(SEED) as ColumnId[]) {
        const items = SEED[columnId];
        const positions = generateNKeysBetween(null, null, items.length);
        items.forEach((item, i) => {
          rows.push({
            id: `${columnId}-${i + 1}`,
            columnId,
            title: item.title,
            description: item.description,
            position: positions[i]!,
          });
        });
      }
      await db.insert(cards).values(rows);
    })();
  }
  return ready;
}

export { cards };
