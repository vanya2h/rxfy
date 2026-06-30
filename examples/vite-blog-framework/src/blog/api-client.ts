import { getLiveClient } from "../live-singleton.js";
import type { Comment, Post, User } from "./types.js";

const isServer = typeof window === "undefined";

type PostsShape = { posts: Post[]; authors: User[] };
type DetailShape = { post: Post; author: User; comments: Comment[] };
type Grants = { entities: Record<string, string>; channels: Record<string, string> };

export async function fetchPosts(): Promise<PostsShape> {
  if (isServer) {
    const { db, posts, users } = await import("../../server/db.js");
    return { posts: await db.select().from(posts), authors: await db.select().from(users) };
  }
  const res = await fetch("/api/posts");
  const body = (await res.json()) as { data: PostsShape; grants: Grants };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

export async function fetchPostDetail({ postId }: { postId: string }): Promise<DetailShape> {
  if (isServer) {
    const { db, posts, users, comments } = await import("../../server/db.js");
    const { eq } = await import("drizzle-orm");
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new Error(`Post ${postId} not found`);
    const [author] = await db.select().from(users).where(eq(users.id, post.authorId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    return { post, author, comments: postComments };
  }
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`);
  if (!res.ok) throw new Error(`Post ${postId} not found`);
  const body = (await res.json()) as { data: DetailShape; grants: Grants };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

const postJson = (url: string, payload: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const patchJson = (url: string, payload: unknown) =>
  fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const del = (url: string) => fetch(url, { method: "DELETE" });

export const createPost = (p: { authorId: string; title: string; body: string }) => postJson("/api/posts", p);
export const editPost = (id: string, p: { title?: string; body?: string }) => patchJson(`/api/posts/${id}`, p);
export const deletePost = (id: string) => del(`/api/posts/${id}`);
export const addComment = (postId: string, p: { author: string; body: string }) =>
  postJson(`/api/posts/${postId}/comments`, p);
export const editComment = (id: string, p: { body: string }) => patchJson(`/api/comments/${id}`, p);
export const deleteComment = (postId: string, id: string) => del(`/api/posts/${postId}/comments/${id}`);
