import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel } from "./model.js";
import { createModelRegistry, createModelStore } from "./model-store.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id });

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

describe("createModelRegistry", () => {
  it("returns the same ModelStore for the same descriptor", () => {
    const registry = createModelRegistry();
    expect(registry.model(postModel)).toBe(registry.model(postModel));
  });

  it("returns different ModelStores for different descriptors", () => {
    const registry = createModelRegistry();
    const otherModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
    expect(registry.model(postModel)).not.toBe(registry.model(otherModel));
  });

  it("different registries have independent stores", () => {
    const r1 = createModelRegistry();
    const r2 = createModelRegistry();
    expect(r1.model(postModel)).not.toBe(r2.model(postModel));
  });
});
