import { describe, expect, it } from "vitest";
import { StatusEnum, createFulfilled, createPending, createRejected } from "../wrapped/wrapped.js";
import { createQueryCache } from "./query-cache.js";

describe("createQueryCache", () => {
  it("getQuery creates an Atom seeded IDLE and returns the same Atom for a key", () => {
    const cache = createQueryCache();
    const a = cache.getQuery("k");
    expect(a.get()).toEqual({ type: StatusEnum.IDLE });
    expect(cache.getQuery("k")).toBe(a); // shared identity → dedup
  });

  it("emits IDLE → PENDING → FULFILLED transitions to subscribers", () => {
    const cache = createQueryCache();
    const atom = cache.getQuery<{ ids: string[] }>("k");
    const seen: StatusEnum[] = [];
    const sub = atom.subscribe((w) => seen.push(w.type));
    atom.set(createPending());
    atom.set(createFulfilled({ ids: ["1"] }));
    expect(seen).toEqual([StatusEnum.IDLE, StatusEnum.PENDING, StatusEnum.FULFILLED]);
    sub.unsubscribe();
  });

  it("peek returns the current value without creating a cell", () => {
    const cache = createQueryCache();
    expect(cache.peek("absent")).toBeUndefined();
    cache.getQuery("k").set(createFulfilled(1));
    expect(cache.peek("k")).toEqual(createFulfilled(1));
  });

  it("entries returns only terminal states", () => {
    const cache = createQueryCache();
    cache.getQuery("idle"); // stays IDLE
    cache.getQuery("pending").set(createPending());
    cache.getQuery("ok").set(createFulfilled(1));
    cache.getQuery("bad").set(createRejected(new Error("x")));
    const keys = cache
      .entries()
      .map(([k]) => k)
      .sort();
    expect(keys).toEqual(["bad", "ok"]);
  });

  it("delete removes the atom and its in-flight promise", () => {
    const cache = createQueryCache();
    const p = Promise.resolve();
    cache.setPromise("k", p);
    cache.getQuery("k").set(createFulfilled(1));
    cache.delete("k");
    expect(cache.peek("k")).toBeUndefined();
    expect(cache.getPromise("k")).toBeUndefined();
  });

  it("tracks in-flight promises", () => {
    const cache = createQueryCache();
    const p = new Promise<void>(() => {});
    cache.setPromise("k", p);
    expect(cache.inflight()).toEqual([p]);
  });
});
