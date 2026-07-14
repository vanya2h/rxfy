import { createResourceRegistry } from "rxfy-server";
import { defineResource } from "rxfy-server-drizzle";
import { todos } from "./db/schema";
import { todoModel } from "./todos";

export const todoResource = defineResource({ table: todos, model: todoModel });

export const resources = createResourceRegistry([todoResource]);
