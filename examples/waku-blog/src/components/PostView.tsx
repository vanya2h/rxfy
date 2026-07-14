"use client";
import { PostDetail, type PostDetailData } from "examples-shared";
import { postDetailState, type PostId } from "examples-shared/data";
import { parseResponse } from "hono/client";
import { useStateData } from "rxfy-react";
import { api } from "../blog/api-client";

export function PostView({ postId, defaultData }: { postId: PostId; defaultData: PostDetailData }) {
  const detail = useStateData({
    state: postDetailState,
    fetchFn: ({ postId: id }) => parseResponse(api.posts[":id"].$get({ param: { id } })),
    params: { postId },
    defaultData,
  });
  return <PostDetail detail={detail} />;
}
