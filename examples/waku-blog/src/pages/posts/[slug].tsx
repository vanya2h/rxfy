import type { PageProps } from "waku/router";
import { fetchPostDetail, postDetailState, type PostId } from "../../blog";
import { HydrateSnapshot } from "../../components/HydrateSnapshot";
import PostDetail from "../../components/PostDetail";
import { prefetch } from "../../ssr";

export default async function PostPage({ slug }: PageProps<"/posts/[slug]">) {
  const postId = slug as PostId;
  const snapshot = await prefetch(postDetailState, fetchPostDetail, { postId });
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostDetail postId={postId} />
    </>
  );
}

export const getConfig = async () => {
  return { render: "dynamic" } as const;
};
