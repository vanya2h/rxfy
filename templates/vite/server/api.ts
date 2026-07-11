import crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { todoResource } from "../src/resources.js";
import { CreateTodoInputSchema, todosState, UpdateTodoInputSchema } from "../src/todos.js";
import { db, todos } from "./db.js";
import { live } from "./live.js";

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    // serve() registers this session's live subscriptions and returns the rows parsed through the state's schemas.
    return c.json(live.serve(c.req.raw, todosState, {}, { todos: rows }));
  })
  .post("/todos", zValidator("json", CreateTodoInputSchema), async (c) => {
    const { title } = c.req.valid("json");
    const row = await live.create(
      todoResource,
      { id: newId(), title, done: false },
      { touch: [touch(todosState, {})] },
    );
    return c.json(row);
  })
  .patch("/todos/:id", zValidator("json", UpdateTodoInputSchema), async (c) => {
    const { done } = c.req.valid("json");
    const row = await live.update(todoResource, c.req.param("id"), { done });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });

export type AppType = typeof api;
