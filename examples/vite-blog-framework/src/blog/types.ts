import type { InferSelectModel } from "drizzle-orm";
import type { comments, posts, users } from "../db/schema.js";

export type User = InferSelectModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type Comment = InferSelectModel<typeof comments>;
