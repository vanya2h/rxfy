import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLens, keyLens } from "../lens/lens.js";
import { isSyncMarked } from "../ssr/sync-marker.js";
import { createModel } from "./model.js";
import { createModelRegistry, createModelStore } from "./model-store.js";

const postModel = createModel({ schema: z.object({ id: z.string(), title: z.string() }), getKey: (x) => x.id });

describe("createModelStore", () => {
  it("emits value after set", async () => {
    const store = createModelStore(postModel);
    const promise = firstValueFrom(store.get("1"));
    store.set("1", { id: "1", title: "Hello" });
    expect(await promise).toEqual({ id: "1", title: "Hello" });
  });

  it("replays last value to new subscribers", async () => {
    const store = createModelStore(postModel);
    store.set("1", { id: "1", title: "Hello" });
    expect(await firstValueFrom(store.get("1"))).toEqual({ id: "1", title: "Hello" });
  });

  it("replaces existing value on set", async () => {
    const store = createModelStore(postModel);
    store.set("1", { id: "1", title: "Old" });
    store.set("1", { id: "1", title: "New" });
    expect(await firstValueFrom(store.get("1"))).toEqual({ id: "1", title: "New" });
  });

  it("emits updated value to existing subscribers", async () => {
    const store = createModelStore(postModel);
    const values: Array<{ id: string; title: string }> = [];
    const sub = store.get("1").subscribe((v) => values.push(v));
    store.set("1", { id: "1", title: "v1" });
    store.set("1", { id: "1", title: "v2" });
    sub.unsubscribe();
    expect(values).toEqual([
      { id: "1", title: "v1" },
      { id: "1", title: "v2" },
    ]);
  });

  it("setMany stores each item by key from descriptor.getKey", async () => {
    const store = createModelStore(postModel);
    store.setMany([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ]);
    expect(await firstValueFrom(store.get("1"))).toEqual({ id: "1", title: "A" });
    expect(await firstValueFrom(store.get("2"))).toEqual({ id: "2", title: "B" });
  });
});

describe("createModelStore added$", () => {
  it("emits the key when an entity is first set", () => {
    const store = createModelStore(postModel);
    const keys: string[] = [];
    store.added$.subscribe((k) => keys.push(k));
    store.set("1", { id: "1", title: "A" });
    expect(keys).toEqual(["1"]);
  });

  it("does not re-emit when an existing entity is updated", () => {
    const store = createModelStore(postModel);
    const keys: string[] = [];
    store.added$.subscribe((k) => keys.push(k));
    store.set("1", { id: "1", title: "A" });
    store.set("1", { id: "1", title: "B" });
    expect(keys).toEqual(["1"]);
  });

  it("emits each key once for setMany", () => {
    const store = createModelStore(postModel);
    const keys: string[] = [];
    store.added$.subscribe((k) => keys.push(k));
    store.setMany([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ]);
    store.setMany([{ id: "1", title: "A2" }]);
    expect(keys).toEqual(["1", "2"]);
  });

  it("replays already-present keys to a late subscriber", () => {
    const store = createModelStore(postModel);
    store.setMany([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ]);
    const keys: string[] = [];
    store.added$.subscribe((k) => keys.push(k));
    store.set("3", { id: "3", title: "C" });
    expect(keys).toEqual(["1", "2", "3"]);
  });

  it("does not emit for keys merely subscribed to via get() but never set", () => {
    const store = createModelStore(postModel);
    const keys: string[] = [];
    store.added$.subscribe((k) => keys.push(k));
    store.get("ghost").subscribe();
    expect(keys).toEqual([]);
  });
});

describe("createModelRegistry", () => {
  it("returns the same ModelStore for the same descriptor", () => {
    const registry = createModelRegistry();
    expect(registry.model(postModel)).toBe(registry.model(postModel));
  });

  it("returns different ModelStores for different descriptors", () => {
    const registry = createModelRegistry();
    const otherModel = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id });
    expect(registry.model(postModel)).not.toBe(registry.model(otherModel));
  });

  it("different registries have independent stores", () => {
    const r1 = createModelRegistry();
    const r2 = createModelRegistry();
    expect(r1.model(postModel)).not.toBe(r2.model(postModel));
  });
});

describe("model store sync value access", () => {
  const model = createModel({ schema: z.object({ id: z.string(), title: z.string() }), getKey: (x) => x.id });

  it("getValue returns the latest value synchronously", () => {
    const store = createModelStore(model);
    expect(store.getValue("1")).toBeUndefined();
    store.set("1", { id: "1", title: "A" });
    expect(store.getValue("1")).toEqual({ id: "1", title: "A" });
    store.set("1", { id: "1", title: "B" });
    expect(store.getValue("1")).toEqual({ id: "1", title: "B" });
  });

  it("setMany populates the value map", () => {
    const store = createModelStore(model);
    store.setMany([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ]);
    expect(store.getValue("2")).toEqual({ id: "2", title: "B" });
  });

  it("valueEntries enumerates all current values", () => {
    const store = createModelStore(model);
    store.set("1", { id: "1", title: "A" });
    store.set("2", { id: "2", title: "B" });
    expect(store.valueEntries()).toEqual([
      ["1", { id: "1", title: "A" }],
      ["2", { id: "2", title: "B" }],
    ]);
  });

  it("get() observables are sync-marked for usePending's render-time probe", () => {
    const store = createModelStore(model);
    expect(isSyncMarked(store.get("1"))).toBe(true);
  });
});

describe("createModelStore cell semantics", () => {
  const Post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "post-cell-test",
  });

  it("get() emits nothing before the first set, then the value", () => {
    const store = createModelStore(Post);
    const emissions: unknown[] = [];
    const sub = store.get("p1").subscribe((v) => emissions.push(v));
    expect(emissions).toEqual([]); // no undefined leaks out
    store.set("p1", { id: "p1", title: "Hello" });
    expect(emissions).toEqual([{ id: "p1", title: "Hello" }]);
    sub.unsubscribe();
  });

  it("getValue() reads synchronously and returns undefined for unknown keys", () => {
    const store = createModelStore(Post);
    expect(store.getValue("missing")).toBeUndefined();
    store.set("p1", { id: "p1", title: "Hi" });
    expect(store.getValue("p1")).toEqual({ id: "p1", title: "Hi" });
  });

  it("valueEntries() lists only set entries", () => {
    const store = createModelStore(Post);
    store.get("subscribed-but-unset").subscribe();
    store.set("p1", { id: "p1", title: "A" });
    expect(store.valueEntries()).toEqual([["p1", { id: "p1", title: "A" }]]);
  });
});

describe("ModelStore.entity", () => {
  const Post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "post-entity-test",
  });

  it("exposes a writable IAtom over an entity; writes reach the store", () => {
    const store = createModelStore(Post);
    store.set("p1", { id: "p1", title: "Old" });
    const post$ = store.entity("p1");
    expect(post$.get()).toEqual({ id: "p1", title: "Old" });
    post$.set({ id: "p1", title: "New" });
    expect(store.getValue("p1")).toEqual({ id: "p1", title: "New" });
  });

  it("a field Lens over the entity round-trips to the store", () => {
    const store = createModelStore(Post);
    store.set("p1", { id: "p1", title: "Old" });
    const title$ = createLens(store.entity("p1"), keyLens<{ id: string; title: string }, "title">("title"));
    title$.set("Edited");
    expect(store.getValue("p1")).toEqual({ id: "p1", title: "Edited" });
  });
});

describe("registry SSR extensions", () => {
  const namedModel = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (x) => x.id,
    name: "item",
  });

  it("exposes a query cache", () => {
    const registry = createModelRegistry();
    registry.queries.getQuery("k").set({ type: "FULFILLED", value: 1 } as any);
    expect(registry.queries.getQuery("k").get()).toEqual({ type: "FULFILLED", value: 1 });
  });

  it("tracks named stores", () => {
    const registry = createModelRegistry();
    const store = registry.model(namedModel);
    expect(registry.namedStores().get("item")).toBe(store);
  });

  it("stashHydration seeds a store created later", () => {
    const registry = createModelRegistry();
    registry.stashHydration("item", { "1": { id: "1", title: "Stashed" } });
    const store = registry.model(namedModel);
    expect(store.getValue("1")).toEqual({ id: "1", title: "Stashed" });
  });

  it("stashHydration writes directly into an existing store", () => {
    const registry = createModelRegistry();
    const store = registry.model(namedModel);
    registry.stashHydration("item", { "2": { id: "2", title: "Direct" } });
    expect(store.getValue("2")).toEqual({ id: "2", title: "Direct" });
  });

  it("stores() enumerates descriptors with their stores", () => {
    const registry = createModelRegistry();
    const store = registry.model(namedModel);
    expect(registry.stores()).toEqual([{ descriptor: namedModel, store }]);
  });
});

describe("registry added$", () => {
  const Todo = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (x) => x.id,
    name: "todo",
  });
  const User = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (x) => x.id,
    name: "user",
  });
  const Anon = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id });

  it("emits { name, key } for entities added to a named store", () => {
    const registry = createModelRegistry();
    const events: Array<{ name: string; key: string }> = [];
    registry.added$.subscribe((e) => events.push(e));
    registry.model(Todo).set("1", { id: "1", title: "A" });
    expect(events).toEqual([{ name: "todo", key: "1" }]);
  });

  it("tags additions with the store they came from", () => {
    const registry = createModelRegistry();
    const events: Array<{ name: string; key: string }> = [];
    registry.added$.subscribe((e) => events.push(e));
    registry.model(Todo).set("t1", { id: "t1", title: "A" });
    registry.model(User).set("u1", { id: "u1", name: "Ada" });
    expect(events).toEqual([
      { name: "todo", key: "t1" },
      { name: "user", key: "u1" },
    ]);
  });

  it("replays entities added before subscription, including stores created earlier", () => {
    const registry = createModelRegistry();
    registry.model(Todo).set("t1", { id: "t1", title: "A" });
    const events: Array<{ name: string; key: string }> = [];
    registry.added$.subscribe((e) => events.push(e));
    registry.model(Todo).set("t2", { id: "t2", title: "B" });
    expect(events).toEqual([
      { name: "todo", key: "t1" },
      { name: "todo", key: "t2" },
    ]);
  });

  it("ignores stores without a name (no topic to address them by)", () => {
    const registry = createModelRegistry();
    const events: Array<{ name: string; key: string }> = [];
    registry.added$.subscribe((e) => events.push(e));
    registry.model(Anon).set("x", { id: "x" });
    expect(events).toEqual([]);
  });
});
