"use client";
import { PostList } from "examples-shared";
import { fetchPosts } from "../blog/fetchers";

export function HomeView() {
  return <PostList fetchPosts={fetchPosts} />;
}
