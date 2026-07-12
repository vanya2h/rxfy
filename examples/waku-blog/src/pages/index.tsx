import { parseResponse } from "hono/client";
import { serverApi } from "../blog/api-server";
import { HomeView } from "../components/HomeView";

export default async function HomePage() {
  // The in-process fetch returns the parsed shape plus a signed `$grant`; HomeView seeds its store
  // from it and the live client subscribes the grant on the browser socket.
  const posts = await parseResponse(serverApi.posts.$get());
  return <HomeView defaultData={posts} />;
}

export const getConfig = async () => {
  // Each render signs a fresh, time-limited grant, so pages can't be statically prerendered.
  return { render: "dynamic" } as const;
};
