import type { PostDetailData, PostId, PostsData } from "examples-shared";
import { hc } from "hono/client";
import { RXFY_SESSION_HEADER } from "rxfy-react";
import type { AppType } from "../../server/api.js";
import { sessionId } from "../session.js";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/api", { headers: { [RXFY_SESSION_HEADER]: sessionId } });

export async function fetchPosts(): Promise<PostsData> {
  if (isServer) {
    const { db, posts, users } = await import("../../server/db.js");
    const rows = await db.select().from(posts);
    const authors = await db.select().from(users);
    return {
      posts: rows,
      authors,
      meta: { total: rows.length, generatedAt: new Date().toISOString() },
    } as unknown as PostsData;
  }
  const res = await client.posts.$get();
  return (await res.json()) as unknown as PostsData;
}

export async function fetchPostDetail({ postId }: { postId: PostId }): Promise<PostDetailData> {
  if (isServer) {
    const { db, posts, users, comments } = await import("../../server/db.js");
    const { eq } = await import("drizzle-orm");
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new Error(`Post ${postId} not found`);
    const [author] = await db.select().from(users).where(eq(users.id, post.userId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    return { post, author, comments: postComments } as unknown as PostDetailData;
  }
  const res = await client.posts[":id"].$get({ param: { id: postId } });
  if (!res.ok) throw new Error(`Post ${postId} not found`);
  return (await res.json()) as unknown as PostDetailData;
}

export const createPost = (p: { userId: string; title: string; body: string }) => client.posts.$post({ json: p });
export const editPost = (id: string, p: { title?: string; body?: string }) =>
  client.posts[":id"].$patch({ param: { id }, json: p });
export const deletePost = (id: string) => client.posts[":id"].$delete({ param: { id } });
export const addComment = (postId: string, p: { name: string; body: string }) =>
  client.posts[":id"].comments.$post({ param: { id: postId }, json: p });
export const deleteComment = (postId: string, id: string) =>
  client.posts[":postId"].comments[":id"].$delete({ param: { postId, id } });
