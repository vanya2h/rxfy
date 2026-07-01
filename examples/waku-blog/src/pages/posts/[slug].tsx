import { postDetailState, type PostId } from "examples-shared/data";
import type { PageProps } from "waku/router";
import { fetchPostDetail } from "../../blog/fetchers";
import { HydrateSnapshot } from "../../components/HydrateSnapshot";
import { PostView } from "../../components/PostView";
import { prefetch } from "../../ssr";

export default async function PostPage({ slug }: PageProps<"/posts/[slug]">) {
  const postId = slug as PostId;
  const snapshot = await prefetch(postDetailState, fetchPostDetail, { postId });
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostView postId={postId} />
    </>
  );
}

export const getConfig = async () => {
  return { render: "dynamic" } as const;
};
