import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  array,
  asKey,
  createModel,
  isFieldDescriptor,
  join,
  ref,
  refArray,
  relationRegistry,
  single,
  type StoreKey,
} from "./model.js";

const schema = z.object({ id: z.string() });

describe("StoreKey", () => {
  it("is assignable to string but string is not assignable to it", () => {
    expectTypeOf<StoreKey<{ id: string }>>().toMatchTypeOf<string>();
    // @ts-expect-error — a bare string is not a StoreKey (this is the whole point)
    const bad: StoreKey<{ id: string }> = "x";
    void bad;
  });

  it("asKey brands a raw id as a StoreKey for the model's entity", () => {
    const m = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "sk" });
    const key = asKey(m, "abc");
    expectTypeOf(key).toEqualTypeOf<StoreKey<{ id: string }>>();
    expect(key).toBe("abc");
  });
});

describe("createModel", () => {
  it("assigns a unique symbol per call", () => {
    const a = createModel({ schema: schema, getKey: (x) => x.id, name: "a" });
    const b = createModel({ schema: schema, getKey: (x) => x.id, name: "b" });
    expect(a._key).not.toBe(b._key);
    expect(typeof a._key).toBe("symbol");
  });

  it("stores schema and getKey", () => {
    const getKey = (x: { id: string }) => x.id;
    const m = createModel({ schema: schema, getKey, name: "m" });
    expect(m.schema).toBe(schema);
    expect(m.getKey({ id: "42" })).toBe("42");
  });

  it("stores the name on the descriptor", () => {
    const named = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "thing" });
    expect(named.name).toBe("thing");
  });
});

describe("ref / refArray", () => {
  const cat = createModel({ schema: z.object({ id: z.string(), name: z.string() }), getKey: (c) => c.id, name: "cat" });

  it("registers single-relation metadata against the field schema", () => {
    const schema = ref(cat);
    expect(relationRegistry.get(schema)).toEqual({ model: cat, kind: "single" });
  });

  it("registers array-relation metadata", () => {
    const schema = refArray(cat);
    expect(relationRegistry.get(schema)).toEqual({ model: cat, kind: "array" });
  });
});

describe("createModel relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "cat5",
  });

  it("collects a relation map from ref/refArray fields, ignoring plain fields", () => {
    const post = createModel({
      schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
      getKey: (p) => p.id,
      name: "post5",
    });
    expect(post.relations).toEqual({ category: { model: cat, kind: "single" } });
  });

  it("fails fast when the schema has no reachable top-level .shape (ref would be invisible)", () => {
    expect(() =>
      createModel({
        // An intersection has no top-level `.shape`, so a relation field would be silently missed.
        schema: z.object({ id: z.string() }).and(z.object({ category: ref(cat) })),
        getKey: (p: { id: string }) => p.id,
        name: "post5bad",
      }),
    ).toThrow(/rxfy: model "post5bad" schema must be a plain object/);
  });
});

describe(".with / join include map", () => {
  const cat = createModel({ schema: z.object({ id: z.string() }), getKey: (c) => c.id, name: "cat6" });
  const post = createModel({
    schema: z.object({ id: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "post6",
  });

  it(".with attaches an include map to the field descriptor", () => {
    const f = single(post).with({ category: true });
    expect(f.kind).toBe("single");
    expect(f.include).toEqual({ category: true });
  });

  it("array().with attaches include too", () => {
    const f = array(post).with({ category: true });
    expect(f.include).toEqual({ category: true });
  });

  it("join carries a nested include for a relation", () => {
    const nested = join(cat, { parent: true });
    expect(nested).toEqual({ kind: "join", model: cat, include: { parent: true } });
  });
});

describe("array", () => {
  it("produces kind:array descriptor wrapping the model", () => {
    const m = createModel({ schema: schema, getKey: (x) => x.id, name: "arr" });
    const f = array(m);
    expect(f.kind).toBe("array");
    expect(f.model).toBe(m);
  });
});

describe("single", () => {
  it("produces kind:single descriptor wrapping the model", () => {
    const m = createModel({ schema: schema, getKey: (x) => x.id, name: "sng" });
    const f = single(m);
    expect(f.kind).toBe("single");
    expect(f.model).toBe(m);
  });
});

describe("isFieldDescriptor", () => {
  const m = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "if-test" });

  it("returns true for array and single descriptors", () => {
    expect(isFieldDescriptor(array(m))).toBe(true);
    expect(isFieldDescriptor(single(m))).toBe(true);
  });

  it("returns false for a zod schema and plain values", () => {
    expect(isFieldDescriptor(z.boolean())).toBe(false);
    expect(isFieldDescriptor(z.object({ a: z.string() }))).toBe(false);
    expect(isFieldDescriptor(null)).toBe(false);
    expect(isFieldDescriptor(42)).toBe(false);
    expect(isFieldDescriptor({ kind: "other" })).toBe(false);
  });
});
