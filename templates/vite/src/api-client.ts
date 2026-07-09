import { hc } from "hono/client";
import { sessionHeaders } from "rxfy-client";
import type { AppType } from "../server/api.js";
import type { Todo } from "./todos.js";

const client = hc<AppType>("/api", { headers: sessionHeaders });

export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  // Build-time constant: the server-only branch and its PGlite import are eliminated
  // from the client bundle. Must stay inline — hoisting it to a const regresses that.
  if (import.meta.env.SSR) {
    const { asc } = await import("drizzle-orm");
    const { db, todos } = await import("../server/db.js");
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    return { todos: rows };
  }
  const res = await client.todos.$get();
  return (await res.json()) as { todos: Todo[] };
}

export const createTodo = (title: string) => client.todos.$post({ json: { title } });

export const toggleTodo = (id: string, done: boolean) => client.todos[":id"].$patch({ param: { id }, json: { done } });
