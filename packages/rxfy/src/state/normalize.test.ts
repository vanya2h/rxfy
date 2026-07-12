import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { collectEntityTopics, denormalizeValue, normalizeResult, normalizeWritable } from "./normalize.js";

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

describe("collectEntityTopics", () => {
  it("lists name:id per entity slot of a normalized query", () => {
    const query = normalizeResult(createModelRegistry(), fields, {
      posts: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      author: { id: "9", name: "Ann" },
    });
    expect(collectEntityTopics(fields, query as Record<string, unknown>).sort()).toEqual(["post:1", "post:2", "user:9"]);
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
