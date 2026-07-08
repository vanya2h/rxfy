import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

// Entities normalize into a shared store keyed by id — every subscriber to an id re-renders on change.
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

// The page's state over that store: data$ emits { todos: string[] } (ids); entities resolve from the store.
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});

// Isomorphic fetcher: on the server it reads the in-memory store directly (like hitting your DB);
// on the client it goes over HTTP to the route handler. The same function feeds both the RSC
// prefetch (server) and useStateData refetches (client).
export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  if (typeof window === "undefined") {
    const { listTodos } = await import("./store");
    return { todos: listTodos() };
  }
  const res = await fetch("/api/todos");
  if (!res.ok) throw new Error("Failed to load todos");
  return (await res.json()) as { todos: Todo[] };
}
