import { describe, expect, it } from "vitest";
import { createFulfilled, createPending, createRejected, StatusEnum } from "../wrapped/wrapped.js";
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

  it("tracks in-flight promises", () => {
    const cache = createQueryCache();
    const p = new Promise<void>(() => {});
    cache.getOrStart("k", () => p);
    expect(cache.inflight()).toEqual([p]);
  });

  it("getOrStart returns the existing promise and skips start on a hit", () => {
    const cache = createQueryCache();
    const p = new Promise<void>(() => {});
    const first = cache.getOrStart("k", () => p);
    let secondStartCalled = false;
    const second = cache.getOrStart("k", () => {
      secondStartCalled = true;
      return new Promise<void>(() => {});
    });
    expect(first).toBe(p);
    expect(second).toBe(p);
    expect(secondStartCalled).toBe(false);
  });

  it("clears the in-flight promise from inflight() after it settles", async () => {
    const cache = createQueryCache();
    let resolve!: () => void;
    const p = new Promise<void>((r) => (resolve = r));
    cache.getOrStart("k", () => p);
    expect(cache.inflight()).toEqual([p]);
    resolve();
    await p;
    expect(cache.inflight()).toEqual([]);
    // slot cleared → the next getOrStart is a miss and runs start again
    const next = new Promise<void>(() => {});
    expect(cache.getOrStart("k", () => next)).toBe(next);
  });
});
