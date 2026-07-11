import { zValidator } from "@hono/zod-validator";
import { CreateCommentInputSchema, postDetailState, type PostId, postsState } from "examples-shared/data";
import { Hono } from "hono";
import { subscribeRead, touchState } from "./live";
import { addComment, getPostDetail, listPosts } from "./store";

export const app = new Hono()
  .basePath("/api")
  .get("/posts", (c) => {
    // Serving = subscribing: the requesting session is now tracked for this state's channel.
    subscribeRead(c.req.raw, postsState, {});
    return c.json(listPosts());
  })
  .get("/posts/:id", (c) => {
    const postId = c.req.param("id") as PostId;
    const detail = getPostDetail(postId);
    if (!detail) return c.json({ error: "not found" }, 404);
    subscribeRead(c.req.raw, postDetailState, { postId });
    return c.json(detail);
  })
  .post("/posts/:id/comments", zValidator("json", CreateCommentInputSchema), (c) => {
    const postId = c.req.param("id");
    const { name, body } = c.req.valid("json");
    const comment = addComment(postId as PostId, { name, body });
    // Every session that was served this post's detail gets a live "1 new comment" badge.
    touchState(postDetailState, { postId });
    return c.json(comment);
  });

export type AppType = typeof app;
