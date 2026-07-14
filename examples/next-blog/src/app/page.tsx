import { parseResponse } from "hono/client";
import { serverApi } from "../blog/api-server";
import { HomeView } from "../components/HomeView";

// Each read is served with a freshly signed, time-limited channel grant, so the payload varies per
// request — the home page can't be statically prerendered.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The in-process fetch returns the post list plus a `$grant`; it rides down as defaultData, and
  // the browser's sync client lifts the grant and subscribes.
  const posts = await parseResponse(serverApi.posts.$get());
  return <HomeView defaultData={posts} />;
}
