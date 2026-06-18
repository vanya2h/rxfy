import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "../model/model.js";
import { defineState, type QueryShapeFromFields, type QueryShapeOf, type WritableQueryShapeFromFields } from "./state.js";

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

describe("defineState key option", () => {
  it("stores the optional key on the descriptor", () => {
    const model = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
    const keyed = defineState({ key: "items", params: z.object({}), model: { items: array(model) } });
    expect(keyed.key).toBe("items");
    const unkeyed = defineState({ params: z.object({}), model: { items: array(model) } });
    expect(unkeyed.key).toBeUndefined();
  });
});

describe("QueryShapeOf", () => {
  it("maps array fields to string[] and single fields to string (type-level)", () => {
    type Shape = { items: { id: string }[]; owner: { id: string } };
    expectTypeOf<QueryShapeOf<Shape>>().toEqualTypeOf<{ items: string[]; owner: string }>();
  });
});

describe("plain value fields", () => {
  const post = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id, name: "p2-post" });
  const fields = {
    posts: array(post),
    isOpen: z.boolean(),
    filters: z.object({ q: z.string() }),
  };

  it("stores a zod schema field entry verbatim", () => {
    const state = defineState({ params: z.object({}), model: fields });
    expect(state.fields.isOpen).toBe(fields.isOpen);
    expect(state.fields.filters).toBe(fields.filters);
  });

  it("maps query shape: entities -> ids, plain -> passthrough (type-level)", () => {
    expectTypeOf<QueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: string[];
      isOpen: boolean;
      filters: { q: string };
    }>();
  });

  it("maps writable shape: entities -> id|entity, plain -> passthrough (type-level)", () => {
    expectTypeOf<WritableQueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: (string | { id: string })[];
      isOpen: boolean;
      filters: { q: string };
    }>();
  });

  it("infers data$ shape on the descriptor (type-level)", () => {
    const state = defineState({ params: z.object({}), model: fields });
    type Query = NonNullable<(typeof state)["_query"]>;
    expectTypeOf<Query>().toEqualTypeOf<{ posts: string[]; isOpen: boolean; filters: { q: string } }>();
  });
});
