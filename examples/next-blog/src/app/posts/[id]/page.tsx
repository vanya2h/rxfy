import { type PostId } from "examples-shared/data";
import { parseResponse } from "hono/client";
import { notFound } from "next/navigation";
import { serverApi } from "../../../blog/api-server";
import { PostView } from "../../../components/PostView";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = id as PostId;
  // The in-process fetch returns the post detail plus a `$grant` for its channel; it rides down as
  // defaultData, and the browser's sync client subscribes. parseResponse throws on the API's 404.
  const detail = await parseResponse(serverApi.posts[":id"].$get({ param: { id: postId } })).catch(() => null);
  if (!detail) notFound();
  return <PostView postId={postId} defaultData={detail} />;
}
