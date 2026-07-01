import { type PostId } from "examples-shared/data";
import { Hono } from "hono";
import { addComment, getPostDetail, listPosts } from "./store.js";

export const app = new Hono()
  .basePath("/api")
  .get("/posts", (c) => c.json(listPosts()))
  .get("/posts/:id", (c) => {
    const detail = getPostDetail(c.req.param("id") as PostId);
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json(detail);
  })
  .post("/posts/:id/comments", async (c) => {
    const { name, body } = (await c.req.json()) as { name: string; body: string };
    const comment = addComment(c.req.param("id") as PostId, { name, body });
    return c.json(comment);
  });

export type AppType = typeof app;
