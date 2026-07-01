import { createResourceRegistry, defineResource } from "rxfy-server/browser";
import { comments, posts, users } from "../db/schema.js";

export const userResource = defineResource({ table: users, name: "user" });
export const postResource = defineResource({ table: posts, name: "post" });
export const commentResource = defineResource({ table: comments, name: "comment" });

export const userModel = userResource.model;
export const postModel = postResource.model;
export const commentModel = commentResource.model;

export const resources = createResourceRegistry([userResource, postResource, commentResource]);
