import { createModel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createResourceRegistry } from "./resource-registry.js";
import type { Resource } from "./storage.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (r) => r.id,
  name: "post",
});
const userModel = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (r) => r.id,
  name: "user",
});

const postResource: Resource<{ id: string; title: string }, { id: string; title: string }, null> = {
  name: "post",
  model: postModel,
  getKey: (r) => r.id,
  binding: null,
};
const userResource: Resource<{ id: string; name: string }, { id: string; name: string }, null> = {
  name: "user",
  model: userModel,
  getKey: (r) => r.id,
  binding: null,
};

describe("createResourceRegistry", () => {
  it("looks resources up by name", () => {
    const reg = createResourceRegistry([postResource, userResource]);
    expect(reg.byName("post")).toBe(postResource);
    expect(reg.byName("user")).toBe(userResource);
    expect(reg.byName("missing")).toBeUndefined();
  });

  it("exposes the model by name", () => {
    const reg = createResourceRegistry([postResource]);
    expect(reg.model("post")).toBe(postResource.model);
    expect(reg.model("missing")).toBeUndefined();
  });

  it("lists all resources", () => {
    const reg = createResourceRegistry([postResource, userResource]);
    expect(reg.all()).toEqual([postResource, userResource]);
  });

  it("throws on duplicate resource names", () => {
    expect(() => createResourceRegistry([postResource, postResource])).toThrow(/duplicate/i);
  });
});
