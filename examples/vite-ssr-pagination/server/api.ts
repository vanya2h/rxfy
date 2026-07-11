import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getUsersPage } from "../shared/generate.ts";

/** The catalogue size shown in the header — the generated list itself never ends. */
const TOTAL_USERS = 1000;

/** Offset cursor as digits ("20", "40", …); omitted ⇒ first page. */
const UsersQuerySchema = z.object({ cursor: z.string().regex(/^\d+$/).optional() });

/**
 * The single data source for both environments: the browser fetches over HTTP, SSR calls
 * `api.request` in-process — the generator never has a second consumer to drift from.
 */
export const api = new Hono()
  .get("/users", zValidator("query", UsersQuerySchema), (c) => {
    const { cursor } = c.req.valid("query");
    return c.json(getUsersPage(cursor ?? null));
  })
  .get("/users-header", (c) => {
    const { items } = getUsersPage(null);
    return c.json({
      topUser: items[0]!,
      meta: {
        total: TOTAL_USERS,
        generatedAt: new Date().toISOString(),
      },
    });
  });

export type AppType = typeof api;
