import { eq } from "drizzle-orm";
import type { Comment, Post, PostId, User } from "examples-shared/data";
import { postDetailState, postsState } from "examples-shared/data";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { type Resource, type StateChannelDescriptor, touch } from "rxfy-server";
import { commentResource, postResource } from "../src/blog/resources.js";
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
    // serve() is a pass-through: registers this session's live subscriptions, returns the data as-is.
    // The state's shape brands entity ids; the raw DB rows are structurally identical, so re-view
    // `data` as the branded shape the state expects.
    return c.json(
      live.serve(
        c.req.raw,
        postsState,
        {},
        data as unknown as {
          posts: Post[];
          authors: User[];
          meta: { total: number; generatedAt: string };
        },
      ),
    );
  })
  .get("/posts/:id", async (c) => {
    const postId = c.req.param("id") as PostId;
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return c.json({ error: "not found" }, 404);
    const [author] = await db.select().from(users).where(eq(users.id, post.userId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    const data = { post, author, comments: postComments };
    return c.json(
      live.serve(
        c.req.raw,
        postDetailState,
        { postId },
        data as unknown as {
          post: Post;
          author: User;
          comments: Comment[];
        },
      ),
    );
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
