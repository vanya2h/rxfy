import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
