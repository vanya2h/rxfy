import type { Todo } from "./todos";

// In-memory stand-in for a real backend: read directly on the server (see fetchTodos), exposed to the
// client via the /api/todos route handler, and written by the createTodo server action. NOTE: this
// resets when the server restarts and is not shared across processes — swap in a real database.
const globalForStore = globalThis as unknown as { __rxfyTodos?: Todo[]; __rxfyNextId?: number };

const todos: Todo[] = (globalForStore.__rxfyTodos ??= [
  { id: "1", title: "Replace lib/store.ts with a real database", done: false },
  { id: "2", title: "Read https://rxfy.vanya2h.me", done: false },
]);
globalForStore.__rxfyNextId ??= todos.length + 1;

export function listTodos(): Todo[] {
  return todos;
}

export function insertTodo(title: string): Todo {
  const todo: Todo = { id: String(globalForStore.__rxfyNextId!++), title, done: false };
  todos.push(todo);
  return todo;
}
