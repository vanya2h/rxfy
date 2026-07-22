import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { array, createModel, ref, single, type StoreKey } from "../model/model.js";
import {
  defineState,
  type QueryShapeFromFields,
  type QueryShapeOf,
  type WritableQueryShapeFromFields,
} from "./state.js";

const postModel = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "post" });
const userModel = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "user" });

describe("defineState", () => {
  it("stores paramsSchema", () => {
    const params = z.object({ page: z.number() });
    const state = defineState({ key: "posts", params, model: { posts: array(postModel) } });
    expect(state.paramsSchema).toBe(params);
  });

  it("stores array field descriptor", () => {
    const state = defineState({
      key: "posts",
      params: z.object({ page: z.number() }),
      model: { posts: array(postModel) },
    });
    expect(state.fields.posts).toMatchObject({ kind: "array", model: postModel });
  });

  it("stores single field descriptor", () => {
    const state = defineState({
      key: "user",
      params: z.object({ id: z.string() }),
      model: { user: single(userModel) },
    });
    expect(state.fields.user).toMatchObject({ kind: "single", model: userModel });
  });

  it("supports multiple fields", () => {
    const state = defineState({
      key: "page",
      params: z.object({ page: z.number() }),
      model: { posts: array(postModel), user: single(userModel) },
    });
    expect(Object.keys(state.fields)).toEqual(["posts", "user"]);
  });
});

describe("defineState key option", () => {
  it("stores the key on the descriptor", () => {
    const model = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "item" });
    const keyed = defineState({ key: "items", params: z.object({}), model: { items: array(model) } });
    expect(keyed.key).toBe("items");
  });
});

describe("query-shape ids are StoreKeys", () => {
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "p3",
  });
  const fields = { posts: array(post), owner: single(post) };

  it("brands entity fields (array + single) as StoreKey", () => {
    expectTypeOf<QueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: StoreKey<{ id: string; title: string }>[];
      owner: StoreKey<{ id: string; title: string }>;
    }>();
  });
});

describe("includes shape reads", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "cat7",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "post7",
  });

  it("joined relation is a readable StoreKey; base has categoryId but no category", () => {
    const joined = { post: single(post).with({ category: true }) };
    const base = { posts: array(post) };

    expectTypeOf<QueryShapeFromFields<typeof joined>["post"]>().toEqualTypeOf<
      StoreKey<{
        id: string;
        title: string;
        categoryId: string;
        category: StoreKey<{ id: string; name: string }>;
      }>
    >();

    expectTypeOf<QueryShapeFromFields<typeof base>["posts"]>().toEqualTypeOf<
      StoreKey<{ id: string; title: string; categoryId: string }>[]
    >();
  });
});

describe("QueryShapeOf", () => {
  it("maps array fields to string[] and single fields to string (type-level)", () => {
    type Shape = { items: { id: string }[]; owner: { id: string } };
    expectTypeOf<QueryShapeOf<Shape>>().toEqualTypeOf<{
      items: StoreKey<{ id: string }>[];
      owner: StoreKey<{ id: string }>;
    }>();
  });
});

describe("defineState window", () => {
  it("stores the window param names on the descriptor", () => {
    const s = defineState({
      key: "posts",
      params: z.object({ orgId: z.string(), page: z.number() }),
      window: ["page"],
      model: { isOpen: z.boolean() },
    });
    expect(s.window).toEqual(["page"]);
  });

  it("defaults window to undefined", () => {
    const s = defineState({ key: "posts", params: z.object({ orgId: z.string() }), model: { isOpen: z.boolean() } });
    expect(s.window).toBeUndefined();
  });

  it("rejects window entries that are not param names (type-level)", () => {
    const s = defineState({
      key: "posts",
      params: z.object({ orgId: z.string(), page: z.number() }),
      // @ts-expect-error — "sort" is not a declared param
      window: ["page", "sort"],
      model: { isOpen: z.boolean() },
    });
    expect(s.key).toBe("posts");
  });
});

describe("plain value fields", () => {
  const post = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "p2-post" });
  const fields = {
    posts: array(post),
    isOpen: z.boolean(),
    filters: z.object({ q: z.string() }),
  };

  it("stores a zod schema field entry verbatim", () => {
    const state = defineState({ key: "plain", params: z.object({}), model: fields });
    expect(state.fields.isOpen).toBe(fields.isOpen);
    expect(state.fields.filters).toBe(fields.filters);
  });

  it("maps query shape: entities -> ids, plain -> passthrough (type-level)", () => {
    expectTypeOf<QueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: StoreKey<{ id: string }>[];
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
    const _state = defineState({ key: "plain", params: z.object({}), model: fields });
    type Query = NonNullable<(typeof _state)["_query"]>;
    expectTypeOf<Query>().toEqualTypeOf<{
      posts: StoreKey<{ id: string }>[];
      isOpen: boolean;
      filters: { q: string };
    }>();
  });
});
