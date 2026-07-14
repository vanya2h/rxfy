import { zValidator } from "@hono/zod-validator";
import { CreateCommentInputSchema, postDetailState, type PostId, postsState } from "examples-shared/data";
import { Hono } from "hono";
import { addComment, getPostDetail, listPosts } from "./store";
import { sync, touchState } from "./sync";

export const app = new Hono()
  .basePath("/api")
  .get("/posts", (c) => {
    // sync.serve() signs a grant for postsState and attaches it as $grant; the client lifts it
    // and subscribes on its own WebSocket. Stateless — no session, no hub write.
    return c.json(sync.serve(postsState, {}, listPosts()));
  })
  .get("/posts/:id", (c) => {
    const postId = c.req.param("id") as PostId;
    const detail = getPostDetail(postId);
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json(sync.serve(postDetailState, { postId }, detail));
  })
  .post("/live/renew", async (c) => {
    // The client posts grants nearing expiry; sync.renew() reissues each (or null when denied).
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => sync.renew(g)) });
  })
  .post("/posts/:id/comments", zValidator("json", CreateCommentInputSchema), (c) => {
    const postId = c.req.param("id");
    const { name, body } = c.req.valid("json");
    const comment = addComment(postId as PostId, { name, body });
    // Every socket subscribed to this post's detail channel gets a live "1 new comment" badge.
    touchState(postDetailState, { postId });
    return c.json(comment);
  });

export type AppType = typeof app;
