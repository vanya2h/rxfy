import type { PostDetailInput } from "examples-shared/data";
import {
  type Comment,
  type CommentId,
  type Post,
  type PostId,
  seedComments,
  seedPosts,
  seedUsers,
  type User,
} from "examples-shared/data";

type Store = { users: User[]; posts: Post[]; comments: Comment[]; nextCommentId: number };

const globalForStore = globalThis as unknown as { __nextBlogStore?: Store };
const store: Store = (globalForStore.__nextBlogStore ??= {
  users: [...seedUsers],
  posts: [...seedPosts],
  comments: [...seedComments],
  nextCommentId: seedComments.length + 1,
});

export function listPosts(): { posts: Post[]; authors: User[]; meta: { total: number; generatedAt: string } } {
  const authorIds = new Set(store.posts.map((p) => p.userId));
  const authors = store.users.filter((u) => authorIds.has(u.id));
  return { posts: store.posts, authors, meta: { total: store.posts.length, generatedAt: new Date().toISOString() } };
}

export function getPostDetail(postId: PostId): PostDetailInput | undefined {
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return undefined;
  const author = store.users.find((u) => u.id === post.userId);
  if (!author) return undefined;
  // `postDetailState` joins each comment's `author` too, so build the nested denormalized shape:
  // serve() splits it back into the user/comment/post stores + an id-only query.
  const userById = new Map(store.users.map((u) => [u.id, u]));
  const comments = store.comments
    .filter((c) => c.postId === postId)
    .map((c) => ({ ...c, author: userById.get(c.userId)! }));
  return { post: { ...post, author, comments } };
}

export function addComment(postId: PostId, input: { name: string; body: string }): Comment {
  // Derive the author from the entered name (a real app would use the session); every comment carries
  // a `userId` for its `author` join.
  const author = store.users.find((u) => u.name === input.name) ?? store.users[0];
  const comment: Comment = {
    id: String(store.nextCommentId++) as CommentId,
    postId,
    userId: author.id,
    name: input.name,
    body: input.body,
  };
  store.comments = [...store.comments, comment];
  return comment;
}
