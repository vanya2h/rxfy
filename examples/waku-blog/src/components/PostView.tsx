"use client";
import { PostDetail } from "examples-shared";
import { type PostId } from "examples-shared/data";
import { fetchPostDetail } from "../blog/fetchers";

export function PostView({ postId }: { postId: PostId }) {
  return <PostDetail postId={postId} fetchPostDetail={fetchPostDetail} />;
}
