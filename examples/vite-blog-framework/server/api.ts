import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createModelRegistry, normalizeResult } from "rxfy";
import { type StateChannelDescriptor, touch } from "rxfy-server";
import { commentResource, postResource, userResource } from "../src/blog/resources.js";
import { postDetailState, postsState } from "../src/blog/states.js";
import { comments, db, posts, users } from "./db.js";
import { live } from "./live.js";

// StateDescriptor.key is `string | undefined` in rxfy but StateChannelDescriptor requires `string`.
// Both states have a key supplied at definition time; cast to satisfy rxfy-server's narrower type.
const postsChannel = postsState as unknown as StateChannelDescriptor;
const postDetailChannel = postDetailState as unknown as StateChannelDescriptor;

const newId = () => crypto.randomUUID();

export const api = new Hono();

api.get("/posts", async (c) => {
  const allPosts = await db.select().from(posts);
  const allUsers = await db.select().from(users);
  const data = { posts: allPosts, authors: allUsers };
  const registry = createModelRegistry();
  normalizeResult(registry, postsState.fields, data);
  const grants = live.grant(registry, {
    entities: [postResource, userResource],
    states: [{ state: postsChannel, params: {} }],
  });
  return c.json({ data, grants });
});

api.get("/posts/:id", async (c) => {
  const postId = c.req.param("id");
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return c.json({ error: "not found" }, 404);
  const [author] = await db.select().from(users).where(eq(users.id, post.authorId));
  const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
  const data = { post, author, comments: postComments };
  const registry = createModelRegistry();
  normalizeResult(registry, postDetailState.fields, data);
  const grants = live.grant(registry, {
    entities: [postResource, userResource, commentResource],
    states: [{ state: postDetailChannel, params: { postId } }],
  });
  return c.json({ data, grants });
});

api.post("/posts", async (c) => {
  const { authorId, title, body } = (await c.req.json()) as { authorId: string; title: string; body: string };
  const row = await live.create(
    postResource,
    { id: newId(), authorId, title, body },
    { touch: [touch(postsChannel, {})] },
  );
  return c.json(row);
});

api.patch("/posts/:id", async (c) => {
  const patch = (await c.req.json()) as Partial<{ title: string; body: string }>;
  const row = await live.update(postResource, c.req.param("id"), patch);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

api.delete("/posts/:id", async (c) => {
  await live.delete(postResource, c.req.param("id"), { touch: [touch(postsChannel, {})] });
  return c.json({ ok: true });
});

api.post("/posts/:id/comments", async (c) => {
  const postId = c.req.param("id");
  const { author, body } = (await c.req.json()) as { author: string; body: string };
  const row = await live.create(
    commentResource,
    { id: newId(), postId, author, body },
    { touch: [touch(postDetailChannel, { postId })] },
  );
  return c.json(row);
});

api.patch("/comments/:id", async (c) => {
  const patch = (await c.req.json()) as Partial<{ body: string }>;
  const row = await live.update(commentResource, c.req.param("id"), patch);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

api.delete("/posts/:postId/comments/:id", async (c) => {
  const postId = c.req.param("postId");
  await live.delete(commentResource, c.req.param("id"), { touch: [touch(postDetailChannel, { postId })] });
  return c.json({ ok: true });
});
