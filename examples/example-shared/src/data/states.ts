import { array, defineState, single } from "rxfy";
import { z } from "zod";
import { type Comment, commentModel, PostIdSchema, postModel, userModel } from "./models.js";

export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: {
    posts: array(postModel),
    authors: array(userModel),
    meta: z.object({ total: z.number(), generatedAt: z.string() }),
  },
});

export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: PostIdSchema }),
  model: { post: single(postModel), author: single(userModel), comments: array(commentModel) },
  mutations: {
    addComment: (prev, comment: Comment) => ({ ...prev, comments: [...prev.comments, comment] }),
  },
});
