import { array, createModel, defineState, single } from "rxfy";
import { z } from "zod";
import { db } from "./db";

// ── Schemas & types ────────────────────────────────────────────────────────────

export const UserIdSchema = z.string().brand("UserId");
export const PostIdSchema = z.string().brand("PostId");
export const CommentIdSchema = z.string().brand("CommentId");

export type UserId = z.infer<typeof UserIdSchema>;
export type PostId = z.infer<typeof PostIdSchema>;
export type CommentId = z.infer<typeof CommentIdSchema>;

export const UserSchema = z.object({
  id: UserIdSchema,
  name: z.string(),
  email: z.string(),
});

export const PostSchema = z.object({
  id: PostIdSchema,
  userId: UserIdSchema,
  title: z.string(),
  body: z.string(),
});

export const CommentSchema = z.object({
  id: CommentIdSchema,
  postId: PostIdSchema,
  name: z.string(),
  body: z.string(),
});

export type User = z.infer<typeof UserSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Comment = z.infer<typeof CommentSchema>;

// ── rxfy models ────────────────────────────────────────────────────────────────

export const userModel = createModel(UserSchema, { getKey: (x) => x.id, name: "user" });
export const postModel = createModel(PostSchema, { getKey: (x) => x.id, name: "post" });
export const commentModel = createModel(CommentSchema, { getKey: (x) => x.id, name: "comment" });

// ── State definitions ──────────────────────────────────────────────────────────

export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: {
    posts: array(postModel),
    authors: array(userModel),
    meta: z.object({ total: z.number(), generatedAt: z.string() }),
  },
});

export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: PostIdSchema }),
  model: {
    post: single(postModel),
    author: single(userModel),
    comments: array(commentModel),
  },
  mutations: {
    addComment: (prev, comment: Comment) => ({
      ...prev,
      comments: [...prev.comments, comment],
    }),
  },
});

// ── Fetchers ───────────────────────────────────────────────────────────────────

export async function fetchPosts(
  _: Record<never, never>,
  signal: AbortSignal,
): Promise<{ posts: Post[]; authors: User[]; meta: { total: number; generatedAt: string } }> {
  await delay(400, signal);
  const authorIds = new Set(db.posts.map((p) => p.userId));
  const authors = db.users.filter((u) => authorIds.has(u.id));
  return { posts: db.posts, authors, meta: { total: db.posts.length, generatedAt: new Date().toISOString() } };
}

export async function fetchPostDetail(
  { postId }: { postId: PostId },
  signal: AbortSignal,
): Promise<{ post: Post; author: User; comments: Comment[] }> {
  await delay(400, signal);
  const post = db.posts.find((p) => p.id === postId);
  if (!post) throw new Error(`Post "${postId}" not found`);
  const author = db.users.find((u) => u.id === post.userId);
  if (!author) throw new Error(`Author "${post.userId}" not found`);
  const comments = db.comments.filter((c) => c.postId === postId);
  return { post, author, comments };
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export function createComment(postId: PostId, name: string, body: string): Comment {
  const comment: Comment = { id: String(db.nextCommentId++) as CommentId, postId, name, body };
  db.comments = [...db.comments, comment];
  return comment;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      reject(signal.reason);
    });
  });
}
