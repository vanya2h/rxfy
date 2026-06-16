import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { denormalizeValue, normalizeResult, normalizeWritable } from "./normalize.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });
const userModel = createModel(z.object({ id: z.string(), name: z.string() }), { getKey: (x) => x.id, name: "user" });

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
