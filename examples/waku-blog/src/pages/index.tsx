import { postsState } from "examples-shared/data";
import { fetchPosts } from "../blog/fetchers";
import { HomeView } from "../components/HomeView";
import { HydrateSnapshot } from "../components/HydrateSnapshot";
import { prefetch } from "../ssr";

export default async function HomePage() {
  const snapshot = await prefetch(postsState, fetchPosts, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <HomeView />
    </>
  );
}

export const getConfig = async () => {
  return { render: "static" } as const;
};
