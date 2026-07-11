import { PostDetail } from "examples-shared";
import { postDetailState, type PostId } from "examples-shared/data";
import { parseResponse } from "hono/client";
import { useStateData } from "rxfy-react";
import { useApi } from "../blog/api-client";
import type { Route } from "./+types/posts.$postId";

export function loader({ params }: Route.LoaderArgs) {
  if (!/^\d+$/.test(params.postId)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { postId: params.postId as PostId };
}

export default function PostDetailRoute({ loaderData }: Route.ComponentProps) {
  const api = useApi();
  const detail = useStateData({
    state: postDetailState,
    fetchFn: ({ postId }) => parseResponse(api.posts[":id"].$get({ param: { id: postId } })),
    params: { postId: loaderData.postId },
  });
  return <PostDetail detail={detail} />;
}
