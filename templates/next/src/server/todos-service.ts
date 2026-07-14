import crypto from "node:crypto";
import { asc } from "drizzle-orm";
import { touch } from "rxfy-server";
import { todoResource } from "../resources";
import { todosState } from "../todos";
import { db, todos } from "./db";
import { sync } from "./sync";

// Server-only data access shared by the RSC page (called directly) and the /api route handlers
// (called over HTTP) — one place for the reads/writes, no self-fetch on the server.

const newId = () => crypto.randomUUID();

/** Read all todos and attach a signed channel grant as `$grant`; the client lifts it and subscribes. */
export async function serveTodos() {
  const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
  return sync.serve(todosState, {}, { todos: rows });
}

/** Create a todo and touch the todos channel so other tabs show the "new todo" badge. */
export async function createTodo(title: string) {
  return sync.create(todoResource, { id: newId(), title, done: false }, { touch: [touch(todosState, {})] });
}

/** Toggle done; sync.update broadcasts an entity patch to every subscribed tab. Null if not found. */
export async function toggleTodo(id: string, done: boolean) {
  return sync.update(todoResource, id, { done });
}

/** Reissue channel grants nearing expiry (or null when denied). */
export function renewGrants(grants: string[]) {
  return grants.map((g) => sync.renew(g));
}
