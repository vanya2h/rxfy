import { type PostId } from "examples-shared/data";
import { parseResponse } from "hono/client";
import type { PageProps } from "waku/router";
import { serverApi } from "../../blog/api-server";
import { PostView } from "../../components/PostView";

export default async function PostPage({ slug }: PageProps<"/posts/[slug]">) {
  const postId = slug as PostId;
  // The in-process fetch returns the post detail plus a signed `$grant`; PostView seeds its store
  // from it and the sync client subscribes the grant. parseResponse throws on the API's 404.
  const detail = await parseResponse(serverApi.posts[":id"].$get({ param: { id: postId } }));
  return <PostView postId={postId} defaultData={detail} />;
}

export const getConfig = async () => {
  return { render: "dynamic" } as const;
};
