import { fetchPosts, postsState } from "../blog";
import { HydrateSnapshot } from "../components/HydrateSnapshot";
import PostList from "../components/PostList";
import { prefetch } from "../ssr";

export default async function HomePage() {
  const snapshot = await prefetch(postsState, fetchPosts, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostList />
    </>
  );
}

export const getConfig = async () => {
  return { render: "static" } as const;
};
