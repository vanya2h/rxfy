import type { Comment, CommentId, Post, PostId, User, UserId } from "./models";

export const seedUsers: User[] = [
  { id: "1" as UserId, name: "Alice Doe", email: "alice@example.com" },
  { id: "2" as UserId, name: "Bob Smith", email: "bob@example.com" },
  { id: "3" as UserId, name: "Carol Lee", email: "carol@example.com" },
];

export const seedPosts: Post[] = [
  {
    id: "1" as PostId,
    userId: "1" as UserId,
    title: "Getting Started with rxfy",
    body: "rxfy is a stream-based, normalized state library built on RxJS. This post walks through Atoms, Lenses, and normalized stores.",
  },
  {
    id: "2" as PostId,
    userId: "2" as UserId,
    title: "RxJS Patterns in 2025",
    body: "Reactive programming has matured: clean operator chains, minimal subscription management, and colocated teardown win.",
  },
  {
    id: "3" as PostId,
    userId: "1" as UserId,
    title: "Streaming SSR with React 19",
    body: "React 19 makes streaming server rendering first-class; combined with Suspense you deliver fast loads without waterfalls.",
  },
  {
    id: "4" as PostId,
    userId: "3" as UserId,
    title: "Zod for Runtime Type Safety",
    body: "TypeScript is compile-time; Zod fills the runtime gap with a chainable schema API that doubles as a parser.",
  },
  {
    id: "5" as PostId,
    userId: "2" as UserId,
    title: "Normalized State, Explained",
    body: "Keeping entities in id-keyed stores and pages as id-lists keeps updates cheap and caches shareable.",
  },
];

export const seedComments: Comment[] = [
  {
    id: "1" as CommentId,
    postId: "1" as PostId,
    name: "Bob Smith",
    body: "Great intro! The Atom primitive reminds me of Jotai.",
  },
  {
    id: "2" as CommentId,
    postId: "1" as PostId,
    name: "Carol Lee",
    body: "Does rxfy support derived state like Recoil selectors?",
  },
  { id: "3" as CommentId, postId: "2" as PostId, name: "Alice Doe", body: "The operator-chain examples are clean." },
];
