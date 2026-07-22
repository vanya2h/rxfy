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
import { sync } from "./sync.js";

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
    // serve() parses the raw rows through the state's schemas and attaches a signed channel grant as
    // `$grant`; the client lifts it and subscribes on its own WebSocket. Stateless — no request needed.
    return c.json(sync.serve(postsState, {}, data));
  })
  .post("/live/renew", async (c) => {
    // The client posts grants nearing expiry; renew() reissues each (or null when denied).
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => sync.renew(g)) });
  })
  .get("/posts/:id", async (c) => {
    const postId = c.req.param("id") as PostId;
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return c.json({ error: "not found" }, 404);
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    // `postDetailState` joins `author` on the post and `author` on each comment, so build the nested
    // denormalized shape: serve() splits it back into the user/comment/post stores + an id-only query.
    const allUsers = await db.select().from(users);
    const userById = new Map(allUsers.map((u) => [u.id, u]));
    const data = {
      post: {
        ...post,
        author: userById.get(post.userId),
        comments: postComments.map((cm) => ({ ...cm, author: userById.get(cm.userId) })),
      },
    };
    return c.json(sync.serve(postDetailState, { postId }, data));
  })
  .post("/posts", zValidator("json", CreatePostInputSchema), async (c) => {
    const { userId, title, body } = c.req.valid("json");
    const row = await sync.create(
      postResource,
      { id: newId(), userId, title, body },
      { touch: [touch(postsState, {})] },
    );
    return c.json(row);
  })
  .patch("/posts/:id", zValidator("json", UpdatePostInputSchema), async (c) => {
    const patch = c.req.valid("json");
    const row = await sync.update(postResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/posts/:id", async (c) => {
    await sync.delete(postResource, c.req.param("id"), { touch: [touch(postsState, {})] });
    return c.json({ ok: true });
  })
  .post("/posts/:id/comments", zValidator("json", CreateCommentInputSchema), async (c) => {
    const postId = c.req.param("id");
    const { name, body } = c.req.valid("json");
    // A real app derives the author from the session; here we match the entered name to a seeded user
    // (falling back to the first) so the created comment carries a `userId` for its `author` join.
    const [match] = await db.select().from(users).where(eq(users.name, name));
    const [fallback] = await db.select().from(users).limit(1);
    const userId = (match ?? fallback).id;
    const row = await sync.create(
      commentResource,
      { id: newId(), postId, userId, name, body },
      { touch: [touch(postDetailState, { postId })] },
    );
    return c.json(row);
  })
  .patch("/comments/:id", zValidator("json", UpdateCommentInputSchema), async (c) => {
    const patch = c.req.valid("json");
    const row = await sync.update(commentResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/posts/:postId/comments/:id", async (c) => {
    const postId = c.req.param("postId");
    await sync.delete(commentResource, c.req.param("id"), { touch: [touch(postDetailState, { postId })] });
    return c.json({ ok: true });
  });

export type AppType = typeof api;
