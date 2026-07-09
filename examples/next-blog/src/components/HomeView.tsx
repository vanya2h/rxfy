"use client";
import { PostList } from "examples-shared";
import { postsState } from "examples-shared/data";
import { useStateData } from "rxfy-react";
import { fetchPosts } from "../blog/fetchers";

export function HomeView() {
  const posts = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });
  return <PostList posts={posts} />;
}
