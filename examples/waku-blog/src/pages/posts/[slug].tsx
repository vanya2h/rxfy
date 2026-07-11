import { randomUUID } from "node:crypto";
import { type PostId } from "examples-shared/data";
import { parseResponse } from "hono/client";
import type { PageProps } from "waku/router";
import { serverApi } from "../../blog/api-server";
import { LiveSession } from "../../blog/LiveSession";
import { PostView } from "../../components/PostView";

export default async function PostPage({ slug }: PageProps<"/posts/[slug]">) {
  const postId = slug as PostId;
  // Mint this render's live session; the in-process fetch registers the post-detail channel
  // under it, and <LiveSession> hands it to the browser's live socket. parseResponse throws on
  // the API's 404.
  const session = randomUUID();
  const detail = await parseResponse(serverApi(session).posts[":id"].$get({ param: { id: postId } }));
  return (
    <>
      <LiveSession session={session} />
      <PostView postId={postId} defaultData={detail} />
    </>
  );
}

export const getConfig = async () => {
  return { render: "dynamic" } as const;
};
