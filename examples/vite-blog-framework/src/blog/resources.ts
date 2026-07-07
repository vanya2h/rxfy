import { commentModel, postModel, userModel } from "examples-shared/data";
import { createResourceRegistry, defineResource } from "rxfy-server/browser";
import { comments, posts, users } from "../db/schema.js";

export const userResource = defineResource({ table: users, model: userModel });
export const postResource = defineResource({ table: posts, model: postModel });
export const commentResource = defineResource({ table: comments, model: commentModel });

export { commentModel, postModel, userModel };

export const resources = createResourceRegistry([userResource, postResource, commentResource]);
