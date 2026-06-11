import { describe, expect, expectTypeOf, it } from "vitest";
import { createQueryCache, type QueryEntry } from "./query-cache.js";

describe("createQueryCache", () => {
  it("stores and retrieves fulfilled entries", () => {
    const cache = createQueryCache();
    cache.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });
    expect(cache.get("todos:{}")).toEqual({
      status: "fulfilled",
      value: { todos: ["1"] },
    });
  });

  it("stores rejected entries with serialized errors", () => {
    const cache = createQueryCache();
    cache.set("k", { status: "rejected", error: { name: "Error", message: "boom" } });
    expect(cache.get("k")).toEqual({
      status: "rejected",
      error: { name: "Error", message: "boom" },
    });
  });

  it("returns undefined for misses and after delete", () => {
    const cache = createQueryCache();
    expect(cache.get("missing")).toBeUndefined();
    cache.set("k", { status: "fulfilled", value: 1 });
    cache.delete("k");
    expect(cache.get("k")).toBeUndefined();
  });

  it("enumerates entries for dehydration", () => {
    const cache = createQueryCache();
    cache.set("a", { status: "fulfilled", value: 1 });
    cache.set("b", { status: "fulfilled", value: 2 });
    expect(cache.entries()).toEqual([
      ["a", { status: "fulfilled", value: 1 }],
      ["b", { status: "fulfilled", value: 2 }],
    ]);
  });

  it("tracks in-flight promises and clears them on settle", async () => {
    const cache = createQueryCache();
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    cache.setPromise("k", promise);
    expect(cache.getPromise("k")).toBe(promise);
    expect(cache.inflight()).toEqual([promise]);
    resolve();
    await promise;
    await Promise.resolve(); // let the .finally cleanup run
    expect(cache.getPromise("k")).toBeUndefined();
    expect(cache.inflight()).toEqual([]);
  });

  it("delete also clears the in-flight promise", () => {
    const cache = createQueryCache();
    cache.setPromise("k", new Promise(() => {}));
    cache.delete("k");
    expect(cache.getPromise("k")).toBeUndefined();
  });

  it("clears the in-flight promise on rejection without unhandled rejection", async () => {
    const cache = createQueryCache();
    const promise = new Promise<void>((_, reject) => setTimeout(() => reject(new Error("boom")), 0));
    cache.setPromise("k", promise);
    await promise.catch(() => {});
    await Promise.resolve(); // let the cleanup microtask run
    expect(cache.getPromise("k")).toBeUndefined();
    expect(cache.inflight()).toEqual([]);
  });

  it("get accepts a type assertion for the entry value (type-level)", () => {
    const cache = createQueryCache();
    cache.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });
    const entry = cache.get<{ todos: string[] }>("todos:{}");
    expectTypeOf(entry).toEqualTypeOf<QueryEntry<{ todos: string[] }> | undefined>();
    if (entry?.status === "fulfilled") {
      expectTypeOf(entry.value).toEqualTypeOf<{ todos: string[] }>();
      expect(entry.value.todos).toEqual(["1"]);
    }
  });
});
