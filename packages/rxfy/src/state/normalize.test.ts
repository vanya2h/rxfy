import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, ref, single } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import {
  collectEntityTopics,
  collectShapeTopics,
  denormalizeValue,
  normalizeResult,
  normalizeWritable,
  writeEntity,
} from "./normalize.js";

describe("writeEntity", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "wcat",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "wpost",
  });

  it("with an include, extracts the joined entity into its store and stores the id on the parent", () => {
    const reg = createModelRegistry();
    const key = writeEntity(
      reg,
      post,
      { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } },
      { category: true },
    );
    expect(key).toBe("p1");
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" });
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "T", categoryId: "c1", category: "c1" });
  });

  it("without an include, leaves a raw id reference and does not touch the child store", () => {
    const reg = createModelRegistry();
    writeEntity(reg, post, { id: "p2", title: "T2", categoryId: "c9" }, undefined);
    expect(reg.model(post).getValue("p2")).toEqual({ id: "p2", title: "T2", categoryId: "c9" });
    expect(reg.model(cat).getValue("c9")).toBeUndefined();
  });

  it("always replaces an existing entity (latest wins)", () => {
    const reg = createModelRegistry();
    writeEntity(reg, post, { id: "p3", title: "old", categoryId: "c1" }, undefined);
    writeEntity(reg, post, { id: "p3", title: "new", categoryId: "c2" }, undefined);
    expect(reg.model(post).getValue("p3")).toEqual({ id: "p3", title: "new", categoryId: "c2" });
  });
});

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (x) => x.id,
  name: "post",
});
const userModel = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (x) => x.id,
  name: "user",
});

const fields = { posts: array(postModel), author: single(userModel) };

type Shape = { posts: { id: string; title: string }[]; author: { id: string; name: string } };

const value: Shape = {
  posts: [
    { id: "1", title: "A" },
    { id: "2", title: "B" },
  ],
  author: { id: "u1", name: "Ann" },
};

describe("normalizeResult", () => {
  it("writes entities into stores and returns ids", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, fields, value);
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    expect(registry.model(postModel).getValue("2")).toEqual({ id: "2", title: "B" });
    expect(registry.model(userModel).getValue("u1")).toEqual({ id: "u1", name: "Ann" });
  });
});

describe("normalizeResult with joined relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "nrcat",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "nrpost",
  });

  it("extracts nested joined entities via the field's include", () => {
    const reg = createModelRegistry();
    const nrFields = { post: single(post).with({ category: true }) };
    const ids = normalizeResult(reg, nrFields, {
      post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } },
    } as never);
    expect(ids).toEqual({ post: "p1" });
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" });
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "T", categoryId: "c1", category: "c1" });
  });
});

describe("normalizeWritable with relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "nwcat",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "nwpost",
  });

  it("normalizes a denormalized entity with a joined relation, extracting the child", () => {
    const reg = createModelRegistry();
    const nwFields = { post: single(post).with({ category: true }) };
    const ids = normalizeWritable(reg, nwFields, {
      post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } },
    } as never);
    expect(ids).toEqual({ post: "p1" });
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" });
  });

  it("passes an id-string element through unchanged (already normalized)", () => {
    const reg = createModelRegistry();
    const nwFields = { post: single(post) };
    const ids = normalizeWritable(reg, nwFields, { post: "p9" } as never);
    expect(ids).toEqual({ post: "p9" });
  });
});

describe("collectEntityTopics", () => {
  it("lists name:id per entity slot of a normalized query", () => {
    const query = normalizeResult(createModelRegistry(), fields, {
      posts: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      author: { id: "9", name: "Ann" },
    });
    expect(collectEntityTopics(fields, query as Record<string, unknown>).sort()).toEqual([
      "post:1",
      "post:2",
      "user:9",
    ]);
  });

  it("ignores plain-value fields", () => {
    const plainFields = { posts: array(postModel), isOpen: z.boolean() };
    const query = normalizeResult(createModelRegistry(), plainFields, {
      posts: [{ id: "1", title: "A" }],
      isOpen: true,
    });
    expect(collectEntityTopics(plainFields, query as Record<string, unknown>)).toEqual(["post:1"]);
  });
});

describe("collectShapeTopics", () => {
  it("extracts name:id topics from a parsed full-entity shape via getKey", () => {
    const shape = {
      posts: [
        { id: "p1", title: "a" },
        { id: "p2", title: "b" },
      ],
      author: { id: "u1", name: "z" },
    };
    expect(collectShapeTopics(fields, shape)).toEqual(["post:p1", "post:p2", "user:u1"]);
  });

  it("skips plain (zod) fields and null single entities", () => {
    const plainFields = { posts: array(postModel), author: single(userModel), count: z.number() };
    const shape = { posts: [], author: null, count: 5 };
    expect(collectShapeTopics(plainFields, shape)).toEqual([]);
  });
});

describe("denormalizeValue", () => {
  it("rebuilds the fetch shape from ids using store values", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, fields, value);
    expect(denormalizeValue<Shape>(registry, fields, { posts: ["1", "2"], author: "u1" })).toEqual(value);
  });

  it("reflects fresher store values (e.g., websocket writes)", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, fields, value);
    registry.model(postModel).set("1", { id: "1", title: "Updated" });
    const result = denormalizeValue<Shape>(registry, fields, { posts: ["1"], author: "u1" });
    expect(result.posts[0]).toEqual({ id: "1", title: "Updated" });
  });

  it("throws a dev-readable error for a missing entity", () => {
    const registry = createModelRegistry();
    expect(() => denormalizeValue<Shape>(registry, fields, { posts: ["ghost"], author: "u1" })).toThrow(
      /entity "ghost".*"post"/,
    );
  });
});

describe("normalizeWritable", () => {
  it("passes string ids through without writing to stores", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, fields, { posts: ["1", "2"], author: "u1" });
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    expect(registry.model(postModel).getValue("1")).toBeUndefined();
    expect(registry.model(userModel).getValue("u1")).toBeUndefined();
  });

  it("writes entity objects to stores and returns their ids", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, fields, {
      posts: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      author: { id: "u1", name: "Ann" },
    });
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    expect(registry.model(postModel).getValue("2")).toEqual({ id: "2", title: "B" });
    expect(registry.model(userModel).getValue("u1")).toEqual({ id: "u1", name: "Ann" });
  });

  it("handles a mix of ids and entities in one array", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, fields, {
      posts: ["1", { id: "2", title: "B" }],
      author: "u1",
    });
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    expect(registry.model(postModel).getValue("2")).toEqual({ id: "2", title: "B" });
    expect(registry.model(postModel).getValue("1")).toBeUndefined();
  });

  it("throws a dev-readable error for a malformed entity", () => {
    const registry = createModelRegistry();
    expect(() =>
      normalizeWritable(registry, fields, {
        posts: [{ id: "1" } as never],
        author: "u1",
      }),
    ).toThrow(/model "post"/);
  });

  it("skips validation when NODE_ENV is production", () => {
    const registry = createModelRegistry();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const ids = normalizeWritable(registry, fields, {
        posts: [{ id: "1" } as never],
        author: "u1",
      });
      expect(ids).toEqual({ posts: ["1"], author: "u1" });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("plain value fields", () => {
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (x) => x.id,
    name: "norm-post",
  });
  const plainFields = {
    posts: array(post),
    isOpen: z.boolean(),
    filters: z.object({ q: z.string() }),
  };
  type PlainShape = { posts: { id: string; title: string }[]; isOpen: boolean; filters: { q: string } };

  const plainValue: PlainShape = {
    posts: [{ id: "1", title: "A" }],
    isOpen: true,
    filters: { q: "hi" },
  };

  it("normalizeResult passes plain values through and normalizes entities", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, plainFields, plainValue);
    expect(ids).toEqual({ posts: ["1"], isOpen: true, filters: { q: "hi" } });
    expect(registry.model(post).getValue("1")).toEqual({ id: "1", title: "A" });
  });

  it("denormalizeValue reads entities from the store and copies plain values", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, plainFields, plainValue);
    const out = denormalizeValue<PlainShape>(registry, plainFields, {
      posts: ["1"],
      isOpen: true,
      filters: { q: "hi" },
    });
    expect(out).toEqual(plainValue);
  });

  it("normalizeWritable passes plain values through", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, plainFields, {
      posts: ["1"],
      isOpen: false,
      filters: { q: "bye" },
    });
    expect(ids).toEqual({ posts: ["1"], isOpen: false, filters: { q: "bye" } });
  });

  it("validates plain values in dev and throws on mismatch", () => {
    const registry = createModelRegistry();
    expect(() =>
      normalizeResult(registry, plainFields, { posts: [], isOpen: "nope" as never, filters: { q: "x" } }),
    ).toThrow(/plain field "isOpen"/);
  });

  it("skips plain validation when NODE_ENV is production", () => {
    const registry = createModelRegistry();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const ids = normalizeResult(registry, plainFields, { posts: [], isOpen: "nope" as never, filters: { q: "x" } });
      expect(ids).toEqual({ posts: [], isOpen: "nope", filters: { q: "x" } });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
