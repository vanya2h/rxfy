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

export const FILTERS: Filter[] = ["all", "active", "done"];

/** Shared by server and client entries — both must derive the same filter from a URL for hydration to match. */
export function parseFilter(value: string | null | undefined): Filter {
  return (FILTERS as string[]).includes(value ?? "") ? (value as Filter) : "all";
}

export const todoModel = createModel({ schema: TodoSchema, getKey: (x) => x.id, name: "todo" });
export const useTodoStore = () => useModelStore(todoModel);

export const todosState = defineState({
  key: "todos",
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: {
    todos: array(todoModel),
    meta: z.object({ total: z.number(), generatedAt: z.string() }),
  },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
    removeTodo: (prev, id: string) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }),
  },
});

// In-memory "database"
let db: Todo[] = [
  { id: "1", title: "Buy groceries", done: false },
  { id: "2", title: "Walk the dog", done: true },
  { id: "3", title: "Read a book", done: false },
];
let nextId = 4;

export async function fetchTodos(
  { filter }: { filter: Filter },
  signal: AbortSignal,
): Promise<{ todos: Todo[]; meta: { total: number; generatedAt: string } }> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const id = setTimeout(resolve, 600);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      reject(signal.reason);
    });
  });
  const todos = filter === "all" ? db : db.filter((t) => t.done === (filter === "done"));
  return { todos, meta: { total: todos.length, generatedAt: new Date().toISOString() } };
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
