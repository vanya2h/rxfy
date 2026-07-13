import { zValidator } from "@hono/zod-validator";
import { CreateCommentInputSchema, postDetailState, type PostId, postsState } from "examples-shared/data";
import { Hono } from "hono";
import { live, touchState } from "./live";
import { addComment, getPostDetail, listPosts } from "./store";

export const app = new Hono()
  .basePath("/api")
  .get("/posts", (c) => {
    // live.serve() attaches a signed grant as `$grant`; the client lifts it and subscribes.
    return c.json(live.serve(postsState, {}, listPosts()));
  })
  .get("/posts/:id", (c) => {
    const postId = c.req.param("id") as PostId;
    const detail = getPostDetail(postId);
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json(live.serve(postDetailState, { postId }, detail));
  })
  .post("/live/renew", async (c) => {
    // The client posts grants nearing expiry; live.renew reissues each (or null when denied).
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => live.renew(g)) });
  })
  .post("/posts/:id/comments", zValidator("json", CreateCommentInputSchema), (c) => {
    const postId = c.req.param("id") as PostId;
    const { name, body } = c.req.valid("json");
    const comment = addComment(postId, { name, body });
    // Every client subscribed to this post's detail channel gets a live "1 new comment" badge.
    touchState(postDetailState, { postId });
    return c.json(comment);
  });

export type AppType = typeof app;
