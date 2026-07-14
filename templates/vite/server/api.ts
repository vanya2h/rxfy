import crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { todoResource } from "../src/resources.js";
import { CreateTodoInputSchema, todosState, UpdateTodoInputSchema } from "../src/todos.js";
import { db, todos } from "./db.js";
import { sync } from "./sync.js";

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    // serve() parses the rows through the state's schemas and attaches a signed channel grant as
    // `$grant`; the client lifts it and subscribes on its own WebSocket. Stateless — no request needed.
    return c.json(sync.serve(todosState, {}, { todos: rows }));
  })
  .post("/live/renew", async (c) => {
    // The client posts grants nearing expiry; renew() reissues each (or null when denied).
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => sync.renew(g)) });
  })
  .post("/todos", zValidator("json", CreateTodoInputSchema), async (c) => {
    const { title } = c.req.valid("json");
    const row = await sync.create(
      todoResource,
      { id: newId(), title, done: false },
      { touch: [touch(todosState, {})] },
    );
    return c.json(row);
  })
  .patch("/todos/:id", zValidator("json", UpdateTodoInputSchema), async (c) => {
    const { done } = c.req.valid("json");
    const row = await sync.update(todoResource, c.req.param("id"), { done });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });

export type AppType = typeof api;
