import { createResourceRegistry, defineResource } from "rxfy-server/browser";
import { todos } from "./db/schema.js";
import { todoModel } from "./todos.js";

export const todoResource = defineResource({ table: todos, model: todoModel });

export const resources = createResourceRegistry([todoResource]);
