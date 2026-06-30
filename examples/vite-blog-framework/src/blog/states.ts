import { array, defineState, single } from "rxfy";
import { z } from "zod";
import { commentModel, postModel, userModel } from "./resources.js";

export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: { posts: array(postModel), authors: array(userModel) },
});

export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: z.string() }),
  model: { post: single(postModel), author: single(userModel), comments: array(commentModel) },
});
