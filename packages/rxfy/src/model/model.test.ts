import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "./model.js";

const schema = z.object({ id: z.string() });

describe("createModel", () => {
  it("assigns a unique symbol per call", () => {
    const a = createModel(schema, { getKey: (x) => x.id });
    const b = createModel(schema, { getKey: (x) => x.id });
    expect(a._key).not.toBe(b._key);
    expect(typeof a._key).toBe("symbol");
  });

  it("stores schema and getKey", () => {
    const getKey = (x: { id: string }) => x.id;
    const m = createModel(schema, { getKey });
    expect(m.schema).toBe(schema);
    expect(m.getKey({ id: "42" })).toBe("42");
  });
});

describe("array", () => {
  it("produces kind:array descriptor wrapping the model", () => {
    const m = createModel(schema, { getKey: (x) => x.id });
    const f = array(m);
    expect(f.kind).toBe("array");
    expect(f.model).toBe(m);
  });
});

describe("single", () => {
  it("produces kind:single descriptor wrapping the model", () => {
    const m = createModel(schema, { getKey: (x) => x.id });
    const f = single(m);
    expect(f.kind).toBe("single");
    expect(f.model).toBe(m);
  });
});
