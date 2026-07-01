import { createModel } from "rxfy";
import { z } from "zod";

export const UserIdSchema = z.string().brand("UserId");
export const PostIdSchema = z.string().brand("PostId");
export const CommentIdSchema = z.string().brand("CommentId");
export type UserId = z.infer<typeof UserIdSchema>;
export type PostId = z.infer<typeof PostIdSchema>;
export type CommentId = z.infer<typeof CommentIdSchema>;

export const UserSchema = z.object({ id: UserIdSchema, name: z.string(), email: z.string() });
export const PostSchema = z.object({ id: PostIdSchema, userId: UserIdSchema, title: z.string(), body: z.string() });
export const CommentSchema = z.object({
  id: CommentIdSchema,
  postId: PostIdSchema,
  name: z.string(),
  body: z.string(),
});
export type User = z.infer<typeof UserSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Comment = z.infer<typeof CommentSchema>;

export const userModel = createModel({ schema: UserSchema, getKey: (x) => x.id, name: "user" });
export const postModel = createModel({ schema: PostSchema, getKey: (x) => x.id, name: "post" });
export const commentModel = createModel({ schema: CommentSchema, getKey: (x) => x.id, name: "comment" });
