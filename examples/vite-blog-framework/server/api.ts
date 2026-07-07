import { eq } from "drizzle-orm";
import { postDetailState, postsState } from "examples-shared/data";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createModelRegistry, normalizeResult } from "rxfy";
import { type Resource, type StateChannelDescriptor, touch } from "rxfy-server";
import { commentResource, postResource, userResource } from "../src/blog/resources.js";
import { comments, db, posts, users } from "./db.js";
import { live } from "./live.js";

const postsChannel = postsState as unknown as StateChannelDescriptor;
const postDetailChannel = postDetailState as unknown as StateChannelDescriptor;
const newId = () => crypto.randomUUID();

// The shared-model resources carry a branded `TRow` (e.g. `Post` with `id: PostId`), whereas
// `live.create`/`live.update` accept `Resource<TTable>` with the table's raw `InferSelectModel` row.
// The bound table is identical; re-view each resource as its raw-row resource so the writer's
// `values` still type-check against the real (unbranded) DB insert shape.
const postWriteResource = postResource as unknown as Resource<typeof posts>;
const commentWriteResource = commentResource as unknown as Resource<typeof comments>;

export const api = new Hono()
  .get("/posts", async (c) => {
    const allPosts = await db.select().from(posts);
    const allUsers = await db.select().from(users);
    const data = {
      posts: allPosts,
      authors: allUsers,
      meta: { total: allPosts.length, generatedAt: new Date().toISOString() },
    };
    const registry = createModelRegistry();
    normalizeResult(registry, postsState.fields, data);
    const grants = live.grant(registry, {
      entities: [postResource, userResource],
      states: [{ state: postsChannel, params: {} }],
    });
    return c.json({ data, grants });
  })
  .get("/posts/:id", async (c) => {
    const postId = c.req.param("id");
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return c.json({ error: "not found" }, 404);
    const [author] = await db.select().from(users).where(eq(users.id, post.userId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    const data = { post, author, comments: postComments };
    const registry = createModelRegistry();
    normalizeResult(registry, postDetailState.fields, data);
    const grants = live.grant(registry, {
      entities: [postResource, userResource, commentResource],
      states: [{ state: postDetailChannel, params: { postId } }],
    });
    return c.json({ data, grants });
  })
  .post(
    "/posts",
    validator("json", (v) => v as { userId: string; title: string; body: string }),
    async (c) => {
      const { userId, title, body } = c.req.valid("json");
      const row = await live.create(
        postWriteResource,
        { id: newId(), userId, title, body },
        { touch: [touch(postsChannel, {})] },
      );
      return c.json(row);
    },
  )
  .patch(
    "/posts/:id",
    validator("json", (v) => v as Partial<{ title: string; body: string }>),
    async (c) => {
      const patch = c.req.valid("json");
      const row = await live.update(postWriteResource, c.req.param("id"), patch);
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    },
  )
  .delete("/posts/:id", async (c) => {
    await live.delete(postResource, c.req.param("id"), { touch: [touch(postsChannel, {})] });
    return c.json({ ok: true });
  })
  .post(
    "/posts/:id/comments",
    validator("json", (v) => v as { name: string; body: string }),
    async (c) => {
      const postId = c.req.param("id");
      const { name, body } = c.req.valid("json");
      const row = await live.create(
        commentWriteResource,
        { id: newId(), postId, name, body },
        { touch: [touch(postDetailChannel, { postId })] },
      );
      return c.json(row);
    },
  )
  .patch(
    "/comments/:id",
    validator("json", (v) => v as Partial<{ body: string }>),
    async (c) => {
      const patch = c.req.valid("json");
      const row = await live.update(commentWriteResource, c.req.param("id"), patch);
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    },
  )
  .delete("/posts/:postId/comments/:id", async (c) => {
    const postId = c.req.param("postId");
    await live.delete(commentResource, c.req.param("id"), { touch: [touch(postDetailChannel, { postId })] });
    return c.json({ ok: true });
  });

export type AppType = typeof api;
