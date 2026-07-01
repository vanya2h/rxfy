import { type PostId } from "examples-shared/data";
import { PostView } from "../../../components/PostView";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostView postId={id as PostId} />;
}
