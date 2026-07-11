"use client";
import { PostList, type PostsData } from "examples-shared";
import { postsState } from "examples-shared/data";
import { parseResponse } from "hono/client";
import { useStateData } from "rxfy-react";
import { api } from "../blog/api-client";

export function HomeView({ defaultData }: { defaultData: PostsData }) {
  const posts = useStateData({
    state: postsState,
    fetchFn: () => parseResponse(api.posts.$get()),
    params: {},
    defaultData,
  });
  return <PostList posts={posts} />;
}
