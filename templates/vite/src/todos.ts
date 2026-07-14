import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

/** Per-endpoint write payloads, derived from the entity schema — used by the server's validators. */
export const CreateTodoInputSchema = TodoSchema.pick({ title: true });
export const UpdateTodoInputSchema = TodoSchema.pick({ done: true });

/** `name` is required for SSR dehydration and doubles as the live topic namespace ("todo:<id>"). */
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

/** `key` is required for SSR query-cache dehydration. */
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: {
    todos: array(todoModel),
  },
});
