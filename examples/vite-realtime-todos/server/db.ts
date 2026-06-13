import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
});

const sqlite = new Database(":memory:");
sqlite.exec(
  `CREATE TABLE IF NOT EXISTS todos (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     done INTEGER NOT NULL DEFAULT 0
   );`,
);

export const db = drizzle(sqlite);

// In-memory DB resets every boot — seed a few rows so the page has content.
export function seed() {
  if (db.select().from(todos).all().length > 0) return;
  db.insert(todos)
    .values([
      { id: "1", title: "Buy groceries", done: false },
      { id: "2", title: "Walk the dog", done: true },
      { id: "3", title: "Read a book", done: false },
    ])
    .run();
}
