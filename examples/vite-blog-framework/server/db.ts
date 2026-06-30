import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { comments, posts, users } from "../src/db/schema.js";

const client = new PGlite(); // in-memory, fresh per process
export const db = drizzle(client);

const DDL = `
  CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
  CREATE TABLE posts (
    id text PRIMARY KEY, author_id text NOT NULL, title text NOT NULL,
    body text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE comments (
    id text PRIMARY KEY, post_id text NOT NULL, author text NOT NULL,
    body text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
  );
`;

let ready: Promise<void> | undefined;

/** Create tables + seed once. Idempotent (awaited by the server before handling requests). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.exec(DDL);
      await db.insert(users).values([
        { id: "u1", name: "Alice Doe", email: "alice@example.com" },
        { id: "u2", name: "Bob Smith", email: "bob@example.com" },
        { id: "u3", name: "Carol Lee", email: "carol@example.com" },
      ]);
      await db.insert(posts).values([
        { id: "p1", authorId: "u1", title: "Getting Started with rxfy", body: "rxfy is a stream-based, normalized state library built on RxJS." },
        { id: "p2", authorId: "u2", title: "RxJS Patterns in 2025", body: "Reactive programming has evolved; clean operator chains and minimal subscriptions win." },
        { id: "p3", authorId: "u3", title: "Zod for Runtime Type Safety", body: "TypeScript is compile-time; Zod fills the runtime gap with a chainable schema API." },
      ]);
      await db.insert(comments).values([
        { id: "c1", postId: "p1", author: "Bob Smith", body: "Great intro!" },
        { id: "c2", postId: "p1", author: "Carol Lee", body: "Does it support derived state?" },
      ]);
    })();
  }
  return ready;
}

export { comments, posts, users };
