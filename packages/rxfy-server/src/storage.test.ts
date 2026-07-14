import type { ModelDescriptor } from "rxfy";
import { describe, expectTypeOf, it } from "vitest";
import type { Resource, SyncStorage } from "./storage.js";

describe("storage types", () => {
  it("Resource carries insert/row/binding params", () => {
    type R = Resource<{ id: string }, { id: string; n: number }, { tag: "x" }>;
    expectTypeOf<R["binding"]>().toEqualTypeOf<{ tag: "x" }>();
    expectTypeOf<R["getKey"]>().toEqualTypeOf<(row: { id: string; n: number }) => string>();
    expectTypeOf<R["model"]>().toEqualTypeOf<ModelDescriptor<{ id: string; n: number }>>();
  });

  it("SyncStorage is generic over the binding", () => {
    expectTypeOf<SyncStorage<{ tag: "x" }>["create"]>().parameter(0).toEqualTypeOf<{ tag: "x" }>();
  });
});
