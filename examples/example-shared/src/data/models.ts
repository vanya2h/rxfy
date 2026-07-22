import { createModel, ref, refArray } from "rxfy";
import { z } from "zod";

export const UserIdSchema = z.string().brand("UserId");
export const PostIdSchema = z.string().brand("PostId");
export const CommentIdSchema = z.string().brand("CommentId");
export type UserId = z.infer<typeof UserIdSchema>;
export type PostId = z.infer<typeof PostIdSchema>;
export type CommentId = z.infer<typeof CommentIdSchema>;

export const UserSchema = z.object({ id: UserIdSchema, name: z.string(), email: z.string() });
export type User = z.infer<typeof UserSchema>;
// Declared first: the schemas below reference it via `ref(userModel)`.
export const userModel = createModel({ schema: UserSchema, getKey: (x) => x.id, name: "user" });

// A comment is authored by a user (`userId`), joinable as the `author` relation.
export const CommentSchema = z.object({
  id: CommentIdSchema,
  postId: PostIdSchema,
  userId: UserIdSchema,
  name: z.string(),
  body: z.string(),
  author: ref(userModel),
});
export type Comment = z.infer<typeof CommentSchema>;
export const commentModel = createModel({
  schema: CommentSchema,
  getKey: (x) => x.id,
  name: "comment",
  fk: { author: "userId" },
});

// A post is authored by a user (`author`) and has many `comments` (the reverse of `comment.postId`).
export const PostSchema = z.object({
  id: PostIdSchema,
  userId: UserIdSchema,
  title: z.string(),
  body: z.string(),
  author: ref(userModel),
  comments: refArray(commentModel),
});
export type Post = z.infer<typeof PostSchema>;
export const postModel = createModel({
  schema: PostSchema,
  getKey: (x) => x.id,
  name: "post",
  fk: { author: "userId" },
});

/** Per-endpoint write payloads, derived from the entity schemas — used by the servers' validators. */
export const CreatePostInputSchema = PostSchema.pick({ userId: true, title: true, body: true });
export const UpdatePostInputSchema = PostSchema.pick({ title: true, body: true }).partial();
export const CreateCommentInputSchema = CommentSchema.pick({ name: true, body: true });
export const UpdateCommentInputSchema = CommentSchema.pick({ body: true }).partial();
export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;
export type UpdatePostInput = z.infer<typeof UpdatePostInputSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;
export type UpdateCommentInput = z.infer<typeof UpdateCommentInputSchema>;
