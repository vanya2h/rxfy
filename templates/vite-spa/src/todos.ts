import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

// Entities normalize into a shared store keyed by id — every subscriber to an id re-renders on store.set.
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

// The page's state over that store: data$ emits { todos: string[] } (ids), entities resolve from the store.
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});

// Stub data source — replace with your API call. Anything async returning the denormalized shape works.
export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  return {
    todos: [
      { id: "1", title: "Replace fetchTodos with a real API call", done: false },
      { id: "2", title: "Read https://rxfy.vanya2h.me", done: false },
    ],
  };
}
