"use client";
import { PostDetail } from "examples-shared";
import { postDetailState, type PostId } from "examples-shared/data";
import { useStateData } from "rxfy-react";
import { fetchPostDetail } from "../blog/fetchers";

export function PostView({ postId }: { postId: PostId }) {
  const detail = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params: { postId } });
  return <PostDetail detail={detail} />;
}
