import type { PostId } from "../../../blog";
import PostDetail from "../../../components/PostDetail";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetail postId={id as PostId} />;
}
