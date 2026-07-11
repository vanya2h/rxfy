import { randomUUID } from "node:crypto";
import { parseResponse } from "hono/client";
import { serverApi } from "../blog/api-server";
import { LiveSession } from "../blog/LiveSession";
import { HomeView } from "../components/HomeView";

export default async function HomePage() {
  // Mint this render's live session; the in-process fetch registers what it serves under it,
  // and <LiveSession> hands it to the browser's live socket.
  const session = randomUUID();
  const posts = await parseResponse(serverApi(session).posts.$get());
  return (
    <>
      <LiveSession session={session} />
      <HomeView defaultData={posts} />
    </>
  );
}

export const getConfig = async () => {
  // Live rendering is per-visitor: each request mints its own session, so no static prerender.
  return { render: "dynamic" } as const;
};
