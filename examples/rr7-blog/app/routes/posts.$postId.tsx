import { type PostId } from "../blog";
import PostDetail from "../components/PostDetail";
import type { Route } from "./+types/posts.$postId";

export function loader({ params }: Route.LoaderArgs) {
  // Routing concern: cheap URL-shape validation, no domain fetch.
  if (!/^\d+$/.test(params.postId)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { postId: params.postId as PostId };
}

export default function PostDetailRoute({ loaderData }: Route.ComponentProps) {
  return <PostDetail postId={loaderData.postId} />;
}
