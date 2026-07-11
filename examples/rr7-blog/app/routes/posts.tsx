import { PostList } from "examples-shared";
import { postsState } from "examples-shared/data";
import { parseResponse } from "hono/client";
import { useStateData } from "rxfy-react";
import { useApi } from "../blog/api-client";

export default function PostsRoute() {
  const api = useApi();
  const posts = useStateData({ state: postsState, fetchFn: () => parseResponse(api.posts.$get()), params: {} });
  return <PostList posts={posts} />;
}
