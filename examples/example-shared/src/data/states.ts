import { array, defineState, single, type StoreKey } from "rxfy";
import { z } from "zod";
import { PostIdSchema, postModel, userModel } from "./models";

export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: {
    posts: array(postModel),
    authors: array(userModel),
    meta: z.object({ total: z.number(), generatedAt: z.string() }),
  },
});

// A recursive query: fetch one post, join its `author`, and join each of its `comments` with THEIR
// own `author` — post → comments → author, resolved into the shared stores in a single fetch.
export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: PostIdSchema }),
  model: { post: single(postModel).with({ author: true, comments: { author: true } }) },
});

// The query keys the detail view mints, carried with their joined relations as *required* fields. This
// is the bridge between the page state and the components that resolve entities: thread these refs (not
// raw ids) down, and `store.get(ref)` returns an entity whose joins read without a `!` — the key's brand
// flows through `get`. `PostRef` → `{ author, comments }` present; `CommentRef` → `{ author }` present.
type DetailQuery = NonNullable<(typeof postDetailState)["_query"]>;
export type PostRef = DetailQuery["post"];
export type CommentRef = (PostRef extends StoreKey<infer V> ? V : never)["comments"][number];

// The two denormalized payloads for `postDetailState`. `PostDetailInput` is what the *server* builds
// and hands to `sync.serve`: a joined relation slot holds the nested entity (serve cleans it and splits
// it into the stores). `PostDetailData` is the transport/output shape the *client* consumes — relations
// serialize as store keys, matching what `useStateData` normalizes and what a `defaultData` prop carries.
export type PostDetailInput = Parameters<NonNullable<(typeof postDetailState)["_shapeInput"]>>[0];
export type PostDetailData = NonNullable<(typeof postDetailState)["_shape"]>;
