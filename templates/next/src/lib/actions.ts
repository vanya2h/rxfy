"use server";
import { insertTodo } from "./store";
import type { Todo } from "./todos";

// Server Action — the real-world write path. Persists to the backend (here, the in-memory store)
// and returns the created entity for the client to fold into its reactive store.
export async function createTodo(title: string): Promise<Todo> {
  return insertTodo(title);
}
