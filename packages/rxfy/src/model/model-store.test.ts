import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createLens, keyLens } from "../lens/lens.js";
import { asKey, createModel, type StoreKey } from "./model.js";
import { createModelRegistry, createModelStore, type ModelStore } from "./model-store.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (x) => x.id,
  name: "post",
});

// Store keys are branded StoreKeys; for these store-level tests a loose brand helper keeps the focus
// on store behavior. (A StoreKey<{id}> is assignable to any StoreKey<{id, ...}> via contravariance.)
const k = (id: string) => id as StoreKey<{ id: string }>;

describe("get is gated to StoreKey", () => {
  it("accepts a StoreKey (via asKey) and rejects a raw string at the type level", () => {
    const reg = createModelRegistry(postModel);
    const store = reg.model(postModel);
    store.set("a", { id: "a", title: "A" });
    expect(store.get(asKey(postModel, "a")).get()).toEqual({ id: "a", title: "A" });
    // @ts-expect-error — a raw string is no longer accepted by get
    store.get("a");
  });
});

describe("createModelStore", () => {
  it("get() reads the value synchronously after set", () => {
    const store = createModelStore(postModel);
    store.set("1", { id: "1", title: "Hello" });
    expect(store.get(k("1")).get()).toEqual({ id: "1", title: "Hello" });
  });

  it("replaces existing value on set", () => {
    const store = createModelStore(postModel);
    store.set("1", { id: "1", title: "Old" });
    store.set("1", { id: "1", title: "New" });
    expect(store.get(k("1")).get()).toEqual({ id: "1", title: "New" });
  });

  it("emits updated values to existing subscribers", () => {
    const store = createModelStore(postModel);
    store.set("1", { id: "1", title: "v1" });
    const values: Array<{ id: string; title: string }> = [];
    const sub = store.get(k("1")).subscribe((v) => values.push(v));
    store.set("1", { id: "1", title: "v2" });
    sub.unsubscribe();
    expect(values).toEqual([
      { id: "1", title: "v1" },
      { id: "1", title: "v2" },
    ]);
  });

  it("setMany stores each item by key from descriptor.getKey", () => {
    const store = createModelStore(postModel);
    store.setMany([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ]);
    expect(store.get(k("1")).get()).toEqual({ id: "1", title: "A" });
    expect(store.get(k("2")).get()).toEqual({ id: "2", title: "B" });
  });

  it("get() throws when the entity is not loaded", () => {
    const store = createModelStore(postModel);
    expect(() => store.get(k("ghost"))).toThrow(/entity "ghost" for model "post" is not loaded/);
  });
});

describe("observe", () => {
  const m = createModel({ schema: z.object({ id: z.string(), n: z.number() }), getKey: (x) => x.id, name: "obs" });

  it("emits undefined for an absent key, then the entity once it arrives, then updates", () => {
    const reg = createModelRegistry(m);
    const store = reg.model(m);
    const seen: (unknown | undefined)[] = [];
    const sub = store.observe("k").subscribe((v) => seen.push(v));
    store.set("k", { id: "k", n: 1 });
    store.set("k", { id: "k", n: 2 });
    sub.unsubscribe();
    expect(seen).toEqual([undefined, { id: "k", n: 1 }, { id: "k", n: 2 }]);
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

  it("does not emit for unloaded keys accessed via get() (which throws)", () => {
    const store = createModelStore(postModel);
    const keys: string[] = [];
    store.added$.subscribe((k) => keys.push(k));
    expect(() => store.get(k("ghost"))).toThrow();
    expect(keys).toEqual([]);
  });
});

describe("registry.descriptor(name)", () => {
  const m = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "desc-lookup" });

  it("returns the descriptor for a materialized model, undefined otherwise", () => {
    const reg = createModelRegistry(m);
    expect(reg.descriptor("desc-lookup")).toBe(m);
    expect(reg.descriptor("nope")).toBeUndefined();
  });
});

describe("createModelRegistry", () => {
  it("returns the same ModelStore for the same descriptor", () => {
    const registry = createModelRegistry();
    expect(registry.model(postModel)).toBe(registry.model(postModel));
  });

  it("returns different ModelStores for different descriptors", () => {
    const registry = createModelRegistry();
    const otherModel = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "other" });
    expect(registry.model(postModel)).not.toBe(registry.model(otherModel));
  });

  it("different registries have independent stores", () => {
    const r1 = createModelRegistry();
    const r2 = createModelRegistry();
    expect(r1.model(postModel)).not.toBe(r2.model(postModel));
  });
});

describe("model store sync value access", () => {
  const model = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (x) => x.id,
    name: "sync-model",
  });

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
});

describe("createModelStore cell semantics", () => {
  const Post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "post-cell-test",
  });

  it("getValue() reads synchronously and returns undefined for unknown keys", () => {
    const store = createModelStore(Post);
    expect(store.getValue("missing")).toBeUndefined();
    store.set("p1", { id: "p1", title: "Hi" });
    expect(store.getValue("p1")).toEqual({ id: "p1", title: "Hi" });
  });

  it("valueEntries() lists only set entries", () => {
    const store = createModelStore(Post);
    expect(() => store.get(k("accessed-but-unset"))).toThrow();
    store.set("p1", { id: "p1", title: "A" });
    expect(store.valueEntries()).toEqual([["p1", { id: "p1", title: "A" }]]);
  });
});

describe("ModelStore.get as writable IAtom", () => {
  const Post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "post-entity-test",
  });

  it("exposes a writable IAtom over an entity; writes reach the store", () => {
    const store = createModelStore(Post);
    store.set("p1", { id: "p1", title: "Old" });
    const post$ = store.get(k("p1"));
    expect(post$.get()).toEqual({ id: "p1", title: "Old" });
    post$.set({ id: "p1", title: "New" });
    expect(store.getValue("p1")).toEqual({ id: "p1", title: "New" });
  });

  it("a field Lens over the entity round-trips to the store", () => {
    const store = createModelStore(Post);
    store.set("p1", { id: "p1", title: "Old" });
    const title$ = createLens(store.get(k("p1")), keyLens<{ id: string; title: string }, "title">("title"));
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

describe("typed registry (createModelRegistry(seed).add(...))", () => {
  const Post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "post",
  });
  const Comment = createModel({
    schema: z.object({ id: z.string(), body: z.string() }),
    getKey: (c) => c.id,
    name: "comment",
  });
  const Stray = createModel({
    schema: z.object({ id: z.string(), what: z.string() }),
    getKey: (s) => s.id,
    name: "stray",
  });

  it("createModel captures the name as a literal type", () => {
    expectTypeOf(Post.name).toEqualTypeOf<"post">();
  });

  it("add() returns the same registry with the store materialized", () => {
    const registry = createModelRegistry(Post);
    const chained = registry.add(Comment);
    expect(chained).toBe(registry);
    expect(chained.namedStores().get("post")).toBeDefined();
    expect(chained.namedStores().get("comment")).toBeDefined();
  });

  it("store(name) resolves the same store as model(descriptor)", () => {
    const registry = createModelRegistry(Post).add(Comment);
    expect(registry.store("post")).toBe(registry.model(Post));
    expect(registry.store("comment")).toBe(registry.model(Comment));
  });

  it("store(name) is typed by the named model's entity", () => {
    const registry = createModelRegistry(Post).add(Comment);
    expectTypeOf(registry.store("post")).toEqualTypeOf<ModelStore<{ id: string; title: string }>>();
    expectTypeOf(registry.store("comment")).toEqualTypeOf<ModelStore<{ id: string; body: string }>>();
    expect(() =>
      // @ts-expect-error — "nope" is not a registered model name
      registry.store("nope"),
    ).toThrow(/no store named "nope"/);
  });

  it("model() only accepts registered descriptors on a typed registry", () => {
    const registry = createModelRegistry(Post).add(Comment);
    expectTypeOf(registry.model(Post)).toEqualTypeOf<ModelStore<{ id: string; title: string }>>();
    // @ts-expect-error — Stray was never added to this registry
    registry.model(Stray);
  });

  it("stashHydration checks the name and entity shape on a typed registry", () => {
    const registry = createModelRegistry(Post).add(Comment);
    registry.stashHydration("post", { "1": { id: "1", title: "typed" } });
    expect(registry.store("post").getValue("1")).toEqual({ id: "1", title: "typed" });
    // @ts-expect-error — "ghost" is not a registered model name
    registry.stashHydration("ghost", {});
    // @ts-expect-error — comment entities have body, not title
    registry.stashHydration("comment", { "1": { id: "1", title: "wrong shape" } });
  });

  it("namedStores() keys are the registered model names", () => {
    const registry = createModelRegistry(Post).add(Comment);
    expectTypeOf(registry.namedStores()).toEqualTypeOf<
      ReadonlyMap<
        "post" | "comment",
        ModelStore<{ id: string; title: string }> | ModelStore<{ id: string; body: string }>
      >
    >();
  });

  it("the no-arg registry stays open: any descriptor, typed store result", () => {
    const registry = createModelRegistry();
    expectTypeOf(registry.model(Stray)).toEqualTypeOf<ModelStore<{ id: string; what: string }>>();
    expect(registry.model(Stray)).toBeDefined();
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
});
