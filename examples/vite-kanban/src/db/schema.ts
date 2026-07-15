import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ColumnId } from "../kanban/models";

export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  columnId: text("column_id").$type<ColumnId>().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: text("position").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
