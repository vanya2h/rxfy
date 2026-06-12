import PostDetail from "../../../components/PostDetail.js";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetail postId={id} />;
}
