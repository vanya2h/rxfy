import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "../model/model.js";
import { defineState } from "./state.js";

const postModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
const userModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });

describe("defineState", () => {
  it("stores paramsSchema", () => {
    const params = z.object({ page: z.number() });
    const state = defineState({ params, model: { posts: array(postModel) } });
    expect(state.paramsSchema).toBe(params);
  });

  it("stores array field descriptor", () => {
    const state = defineState({
      params: z.object({ page: z.number() }),
      model: { posts: array(postModel) },
    });
    expect(state.fields.posts).toEqual({ kind: "array", model: postModel });
  });

  it("stores single field descriptor", () => {
    const state = defineState({
      params: z.object({ id: z.string() }),
      model: { user: single(userModel) },
    });
    expect(state.fields.user).toEqual({ kind: "single", model: userModel });
  });

  it("supports multiple fields", () => {
    const state = defineState({
      params: z.object({ page: z.number() }),
      model: { posts: array(postModel), user: single(userModel) },
    });
    expect(Object.keys(state.fields)).toEqual(["posts", "user"]);
  });
});
