import { type Comment, type CommentId, type PostDetailData, type PostId, type PostsData } from "examples-shared";
import { hc } from "hono/client";
import type { AppType } from "../server/app";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/");

export async function fetchPosts(): Promise<PostsData> {
  if (isServer) {
    const { listPosts } = await import("../server/store");
    return listPosts() as unknown as PostsData;
  }
  const res = await client.api.posts.$get();
  return (await res.json()) as unknown as PostsData;
}

export async function fetchPostDetail({ postId }: { postId: PostId }): Promise<PostDetailData> {
  if (isServer) {
    const { getPostDetail } = await import("../server/store");
    const detail = getPostDetail(postId);
    if (!detail) throw new Error(`Post "${postId}" not found`);
    return detail as unknown as PostDetailData;
  }
  const res = await client.api.posts[":id"].$get({ param: { id: postId } });
  if (!res.ok) throw new Error(`Post "${postId}" not found`);
  return (await res.json()) as unknown as PostDetailData;
}

export async function addCommentRpc(postId: string, input: { name: string; body: string }): Promise<Comment> {
  const res = await client.api.posts[":id"].comments.$post({ param: { id: postId }, json: input });
  const created = (await res.json()) as { id: string; postId: string; name: string; body: string };
  return { id: created.id as CommentId, postId: created.postId as PostId, name: created.name, body: created.body };
}
