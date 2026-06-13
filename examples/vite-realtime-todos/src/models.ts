import { array, createModel, defineState } from "rxfy";
import { useModelStore } from "rxfy-react";
import { z } from "zod";
import { type Todo, TodoSchema } from "../shared/todo.ts";

export type { Todo };

export const todoModel = createModel(TodoSchema, { getKey: (t) => t.id, name: "todo" });
export const useTodoStore = () => useModelStore(todoModel);

export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
    removeTodo: (prev, id: string) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }),
  },
});

// On the server (SSR) fetch must be absolute; on the client a relative path is fine.
const API_BASE = import.meta.env.SSR ? "http://localhost:5175" : "";

export async function fetchTodos(_params: Record<string, never>, signal: AbortSignal): Promise<{ todos: Todo[] }> {
  const res = await fetch(`${API_BASE}/api/todos`, { signal });
  if (!res.ok) throw new Error(`Failed to load todos: ${res.status}`);
  return (await res.json()) as { todos: Todo[] };
}

// --- REST mutations the components call ---
export function apiAddTodo(title: string): Promise<Todo> {
  return fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((r) => r.json() as Promise<Todo>);
}

export function apiToggleTodo(id: string): Promise<Todo> {
  return fetch(`/api/todos/${id}/toggle`, { method: "POST" }).then((r) => r.json() as Promise<Todo>);
}

export function apiRenameTodo(id: string, title: string): Promise<Todo> {
  return fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((r) => r.json() as Promise<Todo>);
}

export function apiDeleteTodo(id: string): Promise<void> {
  return fetch(`/api/todos/${id}`, { method: "DELETE" }).then(() => undefined);
}
