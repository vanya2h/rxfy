import { array, createModel, defineState } from "rxfy";
import { useModelStore } from "rxfy-react";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;
export type Filter = "all" | "active" | "done";

export const todoModel = createModel(TodoSchema, { getKey: (x) => x.id });
export const useTodoStore = () => useModelStore(todoModel);

// version is a re-fetch trigger — increment it to force a new fetch
export const todosState = defineState({
  params: z.object({ filter: z.enum(["all", "active", "done"]), version: z.number() }),
  model: { todos: array(todoModel) },
});

// In-memory "database"
let db: Todo[] = [
  { id: "1", title: "Buy groceries", done: false },
  { id: "2", title: "Walk the dog", done: true },
  { id: "3", title: "Read a book", done: false },
];
let nextId = 4;

export async function fetchTodos({ filter }: { filter: Filter; version: number }) {
  await new Promise((r) => setTimeout(r, 600));
  const todos = filter === "all" ? db : db.filter((t) => t.done === (filter === "done"));
  return { todos };
}

export function createTodo(title: string): Todo {
  const todo: Todo = { id: String(nextId++), title, done: false };
  db = [...db, todo];
  return todo;
}

export function toggleTodo(id: string): Todo {
  db = db.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  return db.find((t) => t.id === id)!;
}
