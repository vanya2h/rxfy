import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { PostId } from "examples-shared/data";
import {
  CreateCommentInputSchema,
  CreatePostInputSchema,
  postDetailState,
  postsState,
  UpdateCommentInputSchema,
  UpdatePostInputSchema,
} from "examples-shared/data";
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { commentResource, postResource } from "../src/blog/resources.js";
import { comments, db, posts, users } from "./db.js";
import { live } from "./live.js";

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/posts", async (c) => {
    const allPosts = await db.select().from(posts);
    const allUsers = await db.select().from(users);
    const data = {
      posts: allPosts,
      authors: allUsers,
      meta: { total: allPosts.length, generatedAt: new Date().toISOString() },
    };
    // serve() registers this session's live subscriptions and parses the raw rows through the state's schemas.
    return c.json(live.serve(c.req.raw, postsState, {}, data));
  })
  .get("/posts/:id", async (c) => {
    const postId = c.req.param("id") as PostId;
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return c.json({ error: "not found" }, 404);
    const [author] = await db.select().from(users).where(eq(users.id, post.userId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    const data = { post, author, comments: postComments };
    return c.json(live.serve(c.req.raw, postDetailState, { postId }, data));
  })
  .post("/posts", zValidator("json", CreatePostInputSchema), async (c) => {
    const { userId, title, body } = c.req.valid("json");
    const row = await live.create(
      postResource,
      { id: newId(), userId, title, body },
      { touch: [touch(postsState, {})] },
    );
    return c.json(row);
  })
  .patch("/posts/:id", zValidator("json", UpdatePostInputSchema), async (c) => {
    const patch = c.req.valid("json");
    const row = await live.update(postResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/posts/:id", async (c) => {
    await live.delete(postResource, c.req.param("id"), { touch: [touch(postsState, {})] });
    return c.json({ ok: true });
  })
  .post("/posts/:id/comments", zValidator("json", CreateCommentInputSchema), async (c) => {
    const postId = c.req.param("id");
    const { name, body } = c.req.valid("json");
    const row = await live.create(
      commentResource,
      { id: newId(), postId, name, body },
      { touch: [touch(postDetailState, { postId })] },
    );
    return c.json(row);
  })
  .patch("/comments/:id", zValidator("json", UpdateCommentInputSchema), async (c) => {
    const patch = c.req.valid("json");
    const row = await live.update(commentResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/posts/:postId/comments/:id", async (c) => {
    const postId = c.req.param("postId");
    await live.delete(commentResource, c.req.param("id"), { touch: [touch(postDetailState, { postId })] });
    return c.json({ ok: true });
  });

export type AppType = typeof api;
