import { PostList } from "examples-shared";
import { fetchPosts } from "../blog/fetchers";

export default function PostsRoute() {
  return <PostList fetchPosts={fetchPosts} />;
}
