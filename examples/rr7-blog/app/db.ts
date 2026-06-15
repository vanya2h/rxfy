import type { Comment, CommentId, Post, PostId, User, UserId } from "./blog";

export const db: {
  users: User[];
  posts: Post[];
  comments: Comment[];
  nextCommentId: number;
} = {
  users: [
    { id: "1" as UserId, name: "Alice Doe", email: "alice@example.com" },
    { id: "2" as UserId, name: "Bob Smith", email: "bob@example.com" },
    { id: "3" as UserId, name: "Carol Lee", email: "carol@example.com" },
  ],
  posts: [
    {
      id: "1" as PostId,
      userId: "1" as UserId,
      title: "Getting Started with rxfy",
      body: "rxfy is a stream-based state management library built on RxJS. It provides Atoms, Edges, and Stores as its core primitives, making async state first-class. This post walks through the basics and explains why reactive streams are a natural fit for UI state management.",
    },
    {
      id: "2" as PostId,
      userId: "2" as UserId,
      title: "RxJS Patterns in 2025",
      body: "Reactive programming has evolved significantly over the past few years. Modern RxJS usage focuses on clean operator chains, minimal subscription management, and colocating teardown logic. We look at the patterns that have stood the test of time.",
    },
    {
      id: "3" as PostId,
      userId: "1" as UserId,
      title: "Next.js App Router Deep Dive",
      body: "The App Router introduced in Next.js 13 fundamentally changes how we think about data fetching. Server Components, streaming SSR, and Suspense boundaries work together to deliver fast user experiences without waterfalling requests.",
    },
    {
      id: "4" as PostId,
      userId: "3" as UserId,
      title: "Zod for Runtime Type Safety",
      body: "TypeScript gives you compile-time safety, but at runtime you are on your own unless you add validation. Zod fills this gap elegantly with a chainable API that doubles as both a schema definition language and a parse engine.",
    },
    {
      id: "5" as PostId,
      userId: "2" as UserId,
      title: "Streaming SSR with React 19",
      body: "React 19 makes streaming server rendering first-class. Combined with Suspense and concurrent features, you can deliver fast initial page loads while fetching data in parallel with rendering, without blocking the entire document.",
    },
  ],
  comments: [
    {
      id: "1" as CommentId,
      postId: "1" as PostId,
      name: "Bob Smith",
      body: "Great intro! The Atom primitive reminds me of Jotai atoms.",
    },
    {
      id: "2" as CommentId,
      postId: "1" as PostId,
      name: "Carol Lee",
      body: "Does rxfy support derived state similar to Recoil selectors?",
    },
    {
      id: "3" as CommentId,
      postId: "2" as PostId,
      name: "Alice Doe",
      body: "The switchMap pattern you described is exactly what I needed for my project.",
    },
    {
      id: "4" as CommentId,
      postId: "3" as PostId,
      name: "Carol Lee",
      body: "The params-as-Promise change in Next 15 caught me off guard at first.",
    },
    {
      id: "5" as CommentId,
      postId: "3" as PostId,
      name: "Bob Smith",
      body: "How does HydrationStream differ from the old getServerSideProps approach?",
    },
    {
      id: "6" as CommentId,
      postId: "4" as PostId,
      name: "Alice Doe",
      body: "Zod's discriminated union support is seriously underrated.",
    },
    {
      id: "7" as CommentId,
      postId: "4" as PostId,
      name: "Bob Smith",
      body: "Switched from io-ts to Zod six months ago and never looked back.",
    },
    {
      id: "8" as CommentId,
      postId: "5" as PostId,
      name: "Carol Lee",
      body: "Does this streaming approach work with the Pages Router too?",
    },
    {
      id: "9" as CommentId,
      postId: "5" as PostId,
      name: "Alice Doe",
      body: "useServerInsertedHTML is the key — it hooks into Next's flush cycle.",
    },
    {
      id: "10" as CommentId,
      postId: "1" as PostId,
      name: "Dave K",
      body: "Bookmarked. Looking forward to trying this in my own project.",
    },
  ],
  nextCommentId: 11,
};
