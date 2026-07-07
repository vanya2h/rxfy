import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { defineResource } from "./resource.js";
import { createResourceRegistry } from "./resource-registry.js";

const posts = pgTable("posts", { id: text("id").primaryKey(), title: text("title").notNull() });
const users = pgTable("users", { id: text("id").primaryKey(), name: text("name").notNull() });

const postResource = defineResource({ table: posts, name: "post" });
const userResource = defineResource({ table: users, name: "user" });

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

  it("preserves per-resource row types (not erased to any)", () => {
    const reg = createResourceRegistry([postResource, userResource]);
    expectTypeOf(reg.byName("post")).toEqualTypeOf<typeof postResource | undefined>();
    expectTypeOf(reg.model("user")).toEqualTypeOf<typeof userResource.model | undefined>();
  });
});
