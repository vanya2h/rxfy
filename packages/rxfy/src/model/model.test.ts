import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, isFieldDescriptor, single } from "./model.js";

const schema = z.object({ id: z.string() });

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
