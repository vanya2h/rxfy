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

const globalForStore = globalThis as unknown as { __wakuBlogStore?: Store };
const store: Store = (globalForStore.__wakuBlogStore ??= {
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

export function getPostDetail(postId: PostId): { post: Post; author: User; comments: Comment[] } | undefined {
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return undefined;
  const author = store.users.find((u) => u.id === post.userId);
  if (!author) return undefined;
  const comments = store.comments.filter((c) => c.postId === postId);
  return { post, author, comments };
}

export function addComment(postId: PostId, input: { name: string; body: string }): Comment {
  const comment: Comment = { id: String(store.nextCommentId++) as CommentId, postId, name: input.name, body: input.body };
  store.comments = [...store.comments, comment];
  return comment;
}
