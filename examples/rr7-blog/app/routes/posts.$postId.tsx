import { PostDetail } from "examples-shared";
import { postDetailState, type PostId } from "examples-shared/data";
import { useStateData } from "rxfy-react";
import { fetchPostDetail } from "../blog/fetchers";
import type { Route } from "./+types/posts.$postId";

export function loader({ params }: Route.LoaderArgs) {
  if (!/^\d+$/.test(params.postId)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { postId: params.postId as PostId };
}

export default function PostDetailRoute({ loaderData }: Route.ComponentProps) {
  const detail = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params: { postId: loaderData.postId } });
  return <PostDetail detail={detail} />;
}
