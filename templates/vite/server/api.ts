import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createModelRegistry, normalizeResult } from "rxfy";
import { type Resource, touch } from "rxfy-server";
import { todoResource } from "../src/resources.js";
import { todosChannel } from "../src/routes.js";
import { todosState } from "../src/todos.js";
import { db, todos } from "./db.js";
import { live } from "./live.js";

// live.create/update accept Resource<TTable> with the table's raw row shape; the model omits
// `createdAt`, so re-view the resource as its raw-row writer resource.
const todoWriteResource = todoResource as unknown as Resource<typeof todos>;

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    const data = { todos: rows };
    const registry = createModelRegistry();
    normalizeResult(registry, todosState.fields, data);
    const grants = live.grant(registry, {
      entities: [todoResource],
      states: [{ state: todosChannel, params: {} }],
    });
    return c.json({ data, grants });
  })
  .post(
    "/todos",
    // Type-cast only — swap in real validation (e.g. zod) before accepting untrusted input.
    validator("json", (v) => v as { title: string }),
    async (c) => {
      const { title } = c.req.valid("json");
      const row = await live.create(
        todoWriteResource,
        { id: newId(), title, done: false },
        { touch: [touch(todosChannel, {})] },
      );
      return c.json(row);
    },
  )
  .patch(
    "/todos/:id",
    validator("json", (v) => v as { done: boolean }),
    async (c) => {
      const { done } = c.req.valid("json");
      const row = await live.update(todoWriteResource, c.req.param("id"), { done });
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    },
  );

export type AppType = typeof api;
