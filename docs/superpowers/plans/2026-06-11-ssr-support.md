# SSR Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-class SSR for rxfy — the server fetches all data on demand via Suspense, captures fulfilled/rejected query state, serializes it into HTML, and the client rehydrates so first paint is already fulfilled with no re-fetch.

**Architecture:** A query cache (keyed by state `key` + stable-stringified params) lives inside the model registry. On the server, `useStateData` throws the fetch promise on cache miss (Suspense); results normalize into model stores (entities) and the query cache (ids). `dehydrate`/`hydrate` serialize both layers. `data$` becomes normalized (ids only); mutations/`set` accept full entities via denormalize → reduce → normalize. A sync-probe in `usePending` makes hydrated first paint byte-identical to server HTML.

**Tech Stack:** TypeScript, RxJS 7, React 18/19, zod, vitest 3, tsup, pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-06-11-ssr-support-design.md`

**Conventions for all tasks:**

- Prettier: 120 print width, double quotes, semicolons, trailing commas.
- After changing `packages/rxfy` source, run `pnpm --filter rxfy build` before running `rxfy-react` tests (rxfy-react resolves `rxfy` from its `dist/`).
- Run a single test file: `pnpm --filter rxfy exec vitest run src/path/file.test.ts` (or `--filter rxfy-react`).
- Commit messages: conventional commits, **no Co-Authored-By trailer**.

---

## File Map

**Create (packages/rxfy):**

- `src/query/stable-stringify.ts` + test — deterministic JSON for cache keys
- `src/query/query-cache.ts` + test — entry + in-flight promise storage
- `src/ssr/sync-marker.ts` + test — `markSync`/`isSyncMarked`/`attachReload`/`getAttachedReload`
- `src/ssr/serialize.ts` + test — `serializeError`/`rehydrateError`/`serializeForHtml`
- `src/ssr/hydration.ts` + test — `DehydratedState`, `dehydrate`, `hydrate`
- `src/state/normalize.ts` + test — `normalizeResult`, `denormalizeValue`

**Modify (packages/rxfy):**

- `src/model/model.ts` — `name` option on `createModel`
- `src/model/model-store.ts` — sync value map, `getValue`, `valueEntries`, marked `get()`, registry extensions
- `src/state/state.ts` — `key` option on `defineState`, `QueryShapeOf` type
- `src/index.ts` — export new modules

**Modify (packages/rxfy-react):**

- `src/StoreProvider.tsx` — `ssr`, `registry`, `dehydratedState` props; `SsrContext`; `window.__RXFY_SSR__` ingest
- `src/usePending.ts` — sync probe + attached-reload-aware `onReload`
- `src/useStateData.ts` — full decision table rework
- `src/index.tsx` — export `collectStateData`, `SsrContext`
- `package.json`, `tsup.config.ts`, `vitest.config.ts` — `./next` subpath, next peer dep, test alias

**Create (packages/rxfy-react):**

- `src/ssr/collect-state-data.ts` + test — two-pass `renderToString` helper
- `src/ssr/buffered-ssr.test.tsx` — `renderToPipeableStream`/`onAllReady` integration test
- `src/next/index.ts`, `src/next/HydrationStream.tsx` + test — Next.js streaming adapter
- `src/next/next-navigation.d.ts`, `src/next/next-navigation.stub.ts` — type shim + test stub

**Modify (examples/vite-todo):**

- `src/todos.ts`, `src/App.tsx`, `src/entry-server.tsx`, `src/entry-client.tsx`, `server.ts`, `index.html`

---

### Task 1: `stableStringify` (core)

**Files:**

- Create: `packages/rxfy/src/query/stable-stringify.ts`
- Test: `packages/rxfy/src/query/stable-stringify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/rxfy/src/query/stable-stringify.test.ts
import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-stringify.js";

describe("stableStringify", () => {
  it("produces identical output regardless of key order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("sorts keys recursively", () => {
    expect(stableStringify({ z: { y: 1, x: 2 }, a: 3 })).toBe('{"a":3,"z":{"x":2,"y":1}}');
  });

  it("preserves array order", () => {
    expect(stableStringify({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it("handles primitives and null", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(null)).toBe("null");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/query/stable-stringify.test.ts`
Expected: FAIL — cannot find module `./stable-stringify.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy/src/query/stable-stringify.ts

/** Deterministic JSON.stringify — object keys sorted recursively so server and client produce identical cache keys. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return val;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy exec vitest run src/query/stable-stringify.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/query/
git commit -m "feat(rxfy): add stableStringify for deterministic cache keys"
```

---

### Task 2: Sync/reload markers (core)

`usePending` must know which observables emit synchronously (safe to probe during render) and how to trigger a real reload from `<Pending>`'s retry button. Markers are symbols attached to observables; only rxfy-controlled observables get marked, so probing never triggers user side effects.

**Files:**

- Create: `packages/rxfy/src/ssr/sync-marker.ts`
- Test: `packages/rxfy/src/ssr/sync-marker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/rxfy/src/ssr/sync-marker.test.ts
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { attachReload, getAttachedReload, isSyncMarked, markSync } from "./sync-marker.js";

describe("sync-marker", () => {
  it("markSync marks and returns the same object", () => {
    const obs = of(1);
    expect(isSyncMarked(obs)).toBe(false);
    expect(markSync(obs)).toBe(obs);
    expect(isSyncMarked(obs)).toBe(true);
  });

  it("attachReload stores a retrievable callback", () => {
    const obs = of(1);
    const reload = vi.fn();
    expect(getAttachedReload(obs)).toBeUndefined();
    expect(attachReload(obs, reload)).toBe(obs);
    getAttachedReload(obs)?.();
    expect(reload).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/ssr/sync-marker.test.ts`
Expected: FAIL — cannot find module `./sync-marker.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy/src/ssr/sync-marker.ts

const RXFY_SYNC = Symbol.for("rxfy.sync");
const RXFY_RELOAD = Symbol.for("rxfy.reload");

type Marked = { [RXFY_SYNC]?: boolean; [RXFY_RELOAD]?: () => void };

/** Marks an observable as emitting synchronously on subscribe — safe for usePending's render-time probe. */
export function markSync<T extends object>(target: T): T {
  (target as Marked)[RXFY_SYNC] = true;
  return target;
}

export function isSyncMarked(target: object): boolean {
  return (target as Marked)[RXFY_SYNC] === true;
}

/** Attaches the owning handle's reload() so Pending's onReload can invalidate the query cache. */
export function attachReload<T extends object>(target: T, reload: () => void): T {
  (target as Marked)[RXFY_RELOAD] = reload;
  return target;
}

export function getAttachedReload(target: object): (() => void) | undefined {
  return (target as Marked)[RXFY_RELOAD];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy exec vitest run src/ssr/sync-marker.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/ssr/
git commit -m "feat(rxfy): add sync-emission and reload markers for observables"
```

---

### Task 3: Error + HTML serialization (core)

**Files:**

- Create: `packages/rxfy/src/ssr/serialize.ts`
- Test: `packages/rxfy/src/ssr/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/rxfy/src/ssr/serialize.test.ts
import { describe, expect, it } from "vitest";
import { rehydrateError, serializeError, serializeForHtml } from "./serialize.js";

describe("serializeError / rehydrateError", () => {
  it("round-trips name and message, strips stack", () => {
    const original = new TypeError("boom");
    const serialized = serializeError(original);
    expect(serialized).toEqual({ name: "TypeError", message: "boom" });
    const rehydrated = rehydrateError(serialized);
    expect(rehydrated).toBeInstanceOf(Error);
    expect(rehydrated.name).toBe("TypeError");
    expect(rehydrated.message).toBe("boom");
  });

  it("handles non-Error throws", () => {
    expect(serializeError("oops")).toEqual({ name: "Error", message: "oops" });
  });
});

describe("serializeForHtml", () => {
  it("escapes < to prevent script-tag breakout", () => {
    const out = serializeForHtml({ html: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    expect(JSON.parse(out)).toEqual({ html: "</script><script>alert(1)" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/ssr/serialize.test.ts`
Expected: FAIL — cannot find module `./serialize.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy/src/ssr/serialize.ts

export type SerializedError = { name: string; message: string };

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

export function rehydrateError(serialized: SerializedError): Error {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  return error;
}

/** JSON for inline <script> embedding — escapes "<" so payloads cannot break out of the script tag. */
export function serializeForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy exec vitest run src/ssr/serialize.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/ssr/serialize.ts packages/rxfy/src/ssr/serialize.test.ts
git commit -m "feat(rxfy): add error and HTML-safe JSON serialization helpers"
```

---

### Task 4: Query cache (core)

**Files:**

- Create: `packages/rxfy/src/query/query-cache.ts`
- Test: `packages/rxfy/src/query/query-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/rxfy/src/query/query-cache.test.ts
import { describe, expect, it } from "vitest";
import { createQueryCache } from "./query-cache.js";

describe("createQueryCache", () => {
  it("stores and retrieves fulfilled entries", () => {
    const cache = createQueryCache();
    cache.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });
    expect(cache.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["1"] } });
  });

  it("stores rejected entries with serialized errors", () => {
    const cache = createQueryCache();
    cache.set("k", { status: "rejected", error: { name: "Error", message: "boom" } });
    expect(cache.get("k")).toEqual({ status: "rejected", error: { name: "Error", message: "boom" } });
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/query/query-cache.test.ts`
Expected: FAIL — cannot find module `./query-cache.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy/src/query/query-cache.ts
import type { SerializedError } from "../ssr/serialize.js";

export type QueryEntry = { status: "fulfilled"; value: unknown } | { status: "rejected"; error: SerializedError };

export type QueryCache = {
  get: (key: string) => QueryEntry | undefined;
  set: (key: string, entry: QueryEntry) => void;
  delete: (key: string) => void;
  entries: () => [string, QueryEntry][];
  /** In-flight promise slot — used for Suspense throws and request deduplication. Never serialized. */
  getPromise: (key: string) => Promise<unknown> | undefined;
  setPromise: (key: string, promise: Promise<unknown>) => void;
  inflight: () => Promise<unknown>[];
};

export function createQueryCache(): QueryCache {
  const entries = new Map<string, QueryEntry>();
  const promises = new Map<string, Promise<unknown>>();

  return {
    get: (key) => entries.get(key),
    set: (key, entry) => {
      entries.set(key, entry);
    },
    delete: (key) => {
      entries.delete(key);
      promises.delete(key);
    },
    entries: () => [...entries.entries()],
    getPromise: (key) => promises.get(key),
    setPromise: (key, promise) => {
      promises.set(key, promise);
      void promise.finally(() => {
        if (promises.get(key) === promise) promises.delete(key);
      });
    },
    inflight: () => [...promises.values()],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy exec vitest run src/query/query-cache.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/query/query-cache.ts packages/rxfy/src/query/query-cache.test.ts
git commit -m "feat(rxfy): add query cache with in-flight promise tracking"
```

---

### Task 5: `name` on models, `key` on states, `QueryShapeOf` type (core)

**Files:**

- Modify: `packages/rxfy/src/model/model.ts`
- Modify: `packages/rxfy/src/state/state.ts`
- Test: `packages/rxfy/src/state/state.test.ts` (extend), `packages/rxfy/src/model/model.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `packages/rxfy/src/model/model.test.ts`:

```ts
describe("createModel name option", () => {
  it("stores the optional name on the descriptor", () => {
    const named = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id, name: "thing" });
    expect(named.name).toBe("thing");
    const unnamed = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
    expect(unnamed.name).toBeUndefined();
  });
});
```

Append to `packages/rxfy/src/state/state.test.ts` (reuse the file's existing model/imports; add `expectTypeOf` import from vitest if not present):

```ts
describe("defineState key option", () => {
  it("stores the optional key on the descriptor", () => {
    const model = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
    const keyed = defineState({ key: "items", params: z.object({}), model: { items: array(model) } });
    expect(keyed.key).toBe("items");
    const unkeyed = defineState({ params: z.object({}), model: { items: array(model) } });
    expect(unkeyed.key).toBeUndefined();
  });
});

describe("QueryShapeOf", () => {
  it("maps array fields to string[] and single fields to string (type-level)", () => {
    type Shape = { items: { id: string }[]; owner: { id: string } };
    expectTypeOf<QueryShapeOf<Shape>>().toEqualTypeOf<{ items: string[]; owner: string }>();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy exec vitest run src/model/model.test.ts src/state/state.test.ts`
Expected: FAIL — `name`/`key` undefined properties, `QueryShapeOf` not exported

- [ ] **Step 3: Implement model.ts change**

In `packages/rxfy/src/model/model.ts`, update `ModelDescriptor` and `createModel`:

```ts
export type ModelDescriptor<T> = {
  readonly _key: symbol;
  /** Stable string identity for SSR dehydration — symbols cannot cross the server/client boundary. */
  readonly name?: string;
  readonly schema: z.ZodType<T>;
  readonly getKey: (item: T) => string;
};

export function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string; name?: string },
): ModelDescriptor<T> {
  return { _key: Symbol(), name: opts.name, schema, getKey: opts.getKey };
}
```

- [ ] **Step 4: Implement state.ts changes**

In `packages/rxfy/src/state/state.ts`:

Add the `QueryShapeOf` type after `ShapeFromFields`:

```ts
/** The normalized shape data$ emits: array fields become string[] (entity keys), single fields become string. */
export type QueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly unknown[] ? string[] : string;
};
```

Add `readonly key?: string;` to `StateDescriptor`:

```ts
export type StateDescriptor<TParams, TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  /** Stable string identity for the SSR query cache. States without a key opt out of SSR caching. */
  readonly key?: string;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly fields: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
  readonly mutations: TMutations;
};
```

Add `key?: string;` to both `defineState` overload parameter objects and the implementation's parameter object, and include it in the returned object:

```ts
return {
  key: def.key,
  paramsSchema: def.params,
  fields: def.model as any,
  mutations: (def.mutations ?? {}) as any,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter rxfy exec vitest run src/model/model.test.ts src/state/state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts packages/rxfy/src/state/state.ts packages/rxfy/src/state/state.test.ts
git commit -m "feat(rxfy): add model name, state key, and QueryShapeOf type for SSR"
```

---

### Task 6: Model store sync value map + marked `get()` (core)

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts` (the `ModelStore` type and `createModelStore` only — registry changes are Task 7)
- Test: `packages/rxfy/src/model/model-store.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `packages/rxfy/src/model/model-store.test.ts`:

```ts
import { isSyncMarked } from "../ssr/sync-marker.js";

describe("model store sync value access", () => {
  const model = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id });

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy exec vitest run src/model/model-store.test.ts`
Expected: FAIL — `getValue` is not a function

- [ ] **Step 3: Implement**

In `packages/rxfy/src/model/model-store.ts`, update the `ModelStore` type and `createModelStore`:

```ts
import { Observable, ReplaySubject } from "rxjs";
import { markSync } from "../ssr/sync-marker.js";
import type { ModelDescriptor } from "./model.js";

export type ModelStore<T> = {
  get: (key: string) => Observable<T>;
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;
  /** Synchronous read of the latest value — used by denormalization and dehydration. */
  getValue: (key: string) => T | undefined;
  valueEntries: () => [string, T][];
};

export function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const subjects = new Map<string, ReplaySubject<T>>();
  const values = new Map<string, T>();

  const getSubject = (key: string): ReplaySubject<T> => {
    if (!subjects.has(key)) {
      subjects.set(key, new ReplaySubject<T>(1));
    }
    return subjects.get(key)!;
  };

  const set = (key: string, val: T): void => {
    values.set(key, val);
    getSubject(key).next(val);
  };

  return {
    get: (key) => markSync(getSubject(key).asObservable()),
    set,
    setMany: (items) => items.forEach((item) => set(descriptor.getKey(item), item)),
    getValue: (key) => values.get(key),
    valueEntries: () => [...values.entries()],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy exec vitest run src/model/model-store.test.ts`
Expected: PASS (existing + 4 new tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): add sync value map and sync-marked observables to model store"
```

---

### Task 7: Registry — query cache, named stores, hydration stash (core)

The registry gains the query cache and the machinery `hydrate` needs: entities for a model that hasn't been touched yet are stashed by name and drained when the store is first created.

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts` (the `IModelRegistry` type and `createModelRegistry`)
- Test: `packages/rxfy/src/model/model-store.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `packages/rxfy/src/model/model-store.test.ts`:

```ts
describe("registry SSR extensions", () => {
  const namedModel = createModel(z.object({ id: z.string(), title: z.string() }), {
    getKey: (x) => x.id,
    name: "item",
  });

  it("exposes a query cache", () => {
    const registry = createModelRegistry();
    registry.queries.set("k", { status: "fulfilled", value: 1 });
    expect(registry.queries.get("k")).toEqual({ status: "fulfilled", value: 1 });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy exec vitest run src/model/model-store.test.ts`
Expected: FAIL — `queries` undefined

- [ ] **Step 3: Implement**

In `packages/rxfy/src/model/model-store.ts`, replace `IModelRegistry` and `createModelRegistry` (add the import at top):

```ts
import { createQueryCache, type QueryCache } from "../query/query-cache.js";

export type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
  /** SSR query cache — fulfilled/rejected entries keyed by state key + params. */
  queries: QueryCache;
  namedStores: () => ReadonlyMap<string, ModelStore<any>>;
  stores: () => { descriptor: ModelDescriptor<any>; store: ModelStore<any> }[];
  /** Queue entities for a named model; seeds the store now if it exists, or on first creation otherwise. */
  stashHydration: (name: string, entities: Record<string, unknown>) => void;
};

export function createModelRegistry(): IModelRegistry {
  const stores = new Map<symbol, ModelStore<any>>();
  const descriptors = new Map<symbol, ModelDescriptor<any>>();
  const named = new Map<string, ModelStore<any>>();
  const stash = new Map<string, Record<string, unknown>>();
  const queries = createQueryCache();

  return {
    queries,
    model: <T>(descriptor: ModelDescriptor<T>): ModelStore<T> => {
      if (!stores.has(descriptor._key)) {
        const store = createModelStore(descriptor);
        stores.set(descriptor._key, store);
        descriptors.set(descriptor._key, descriptor);
        if (descriptor.name) {
          named.set(descriptor.name, store);
          const pending = stash.get(descriptor.name);
          if (pending) {
            stash.delete(descriptor.name);
            for (const [key, value] of Object.entries(pending)) store.set(key, value as T);
          }
        }
      }
      return stores.get(descriptor._key) as ModelStore<T>;
    },
    namedStores: () => named,
    stores: () => [...stores.keys()].map((key) => ({ descriptor: descriptors.get(key)!, store: stores.get(key)! })),
    stashHydration: (name, entities) => {
      const existing = named.get(name);
      if (existing) {
        for (const [key, value] of Object.entries(entities)) existing.set(key, value);
      } else {
        stash.set(name, { ...stash.get(name), ...entities });
      }
    },
  };
}
```

- [ ] **Step 4: Run all core tests**

Run: `pnpm --filter rxfy exec vitest run`
Expected: PASS (no regressions in lens/batcher/model/state tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): extend registry with query cache, named stores, hydration stash"
```

---

### Task 8: `normalizeResult` / `denormalizeValue` (core)

Normalization moves out of `useStateData` into core so the server fetch path and the React hook share one implementation. `normalizeResult` splits a fetch result (entities → stores, ids → return value). `denormalizeValue` rebuilds the fetch shape from ids by reading store value maps — used so mutations/`set` reducers see full, fresh entities.

**Files:**

- Create: `packages/rxfy/src/state/normalize.ts`
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/rxfy/src/state/normalize.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel, array, single } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { denormalizeValue, normalizeResult } from "./normalize.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });
const userModel = createModel(z.object({ id: z.string(), name: z.string() }), { getKey: (x) => x.id, name: "user" });

const fields = { posts: array(postModel), author: single(userModel) };

type Shape = { posts: { id: string; title: string }[]; author: { id: string; name: string } };

const value: Shape = {
  posts: [
    { id: "1", title: "A" },
    { id: "2", title: "B" },
  ],
  author: { id: "u1", name: "Ann" },
};

describe("normalizeResult", () => {
  it("writes entities into stores and returns ids", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, fields, value);
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    expect(registry.model(postModel).getValue("2")).toEqual({ id: "2", title: "B" });
    expect(registry.model(userModel).getValue("u1")).toEqual({ id: "u1", name: "Ann" });
  });
});

describe("denormalizeValue", () => {
  it("rebuilds the fetch shape from ids using store values", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, fields, value);
    expect(denormalizeValue<Shape>(registry, fields, { posts: ["1", "2"], author: "u1" })).toEqual(value);
  });

  it("reflects fresher store values (e.g., websocket writes)", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, fields, value);
    registry.model(postModel).set("1", { id: "1", title: "Updated" });
    const result = denormalizeValue<Shape>(registry, fields, { posts: ["1"], author: "u1" });
    expect(result.posts[0]).toEqual({ id: "1", title: "Updated" });
  });

  it("throws a dev-readable error for a missing entity", () => {
    const registry = createModelRegistry();
    expect(() => denormalizeValue<Shape>(registry, fields, { posts: ["ghost"], author: "u1" })).toThrow(
      /entity "ghost".*"post"/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/state/normalize.test.ts`
Expected: FAIL — cannot find module `./normalize.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy/src/state/normalize.ts
import type { IModelRegistry } from "../model/model-store.js";
import type { FieldsMap } from "./state.js";
import type { QueryShapeOf } from "./state.js";

/** Splits a denormalized fetch result: entities → model stores, ids → returned query shape. */
export function normalizeResult<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: TShape,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, desc] of Object.entries(fields)) {
    const store = registry.model(desc.model);
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (desc.kind === "array") {
      const items = fieldValue as unknown[];
      store.setMany(items);
      ids[fieldName] = items.map((item) => desc.model.getKey(item));
    } else {
      const key = desc.model.getKey(fieldValue);
      store.set(key, fieldValue);
      ids[fieldName] = key;
    }
  }
  return ids as QueryShapeOf<TShape>;
}

/** Rebuilds the fetch shape from ids by reading store value maps — reducers always see the freshest entities. */
export function denormalizeValue<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  ids: QueryShapeOf<TShape>,
): TShape {
  const value: Record<string, unknown> = {};
  for (const [fieldName, desc] of Object.entries(fields)) {
    const store = registry.model(desc.model);
    const read = (key: string): unknown => {
      const entity = store.getValue(key);
      if (entity === undefined) {
        throw new Error(
          `rxfy: entity "${key}" for model "${desc.model.name ?? "<unnamed>"}" is missing from the store during denormalization`,
        );
      }
      return entity;
    };
    const fieldIds = (ids as Record<string, unknown>)[fieldName];
    value[fieldName] = desc.kind === "array" ? (fieldIds as string[]).map(read) : read(fieldIds as string);
  }
  return value as TShape;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy exec vitest run src/state/normalize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): add normalizeResult and denormalizeValue helpers"
```

---

### Task 9: `dehydrate` / `hydrate` + core index exports

**Files:**

- Create: `packages/rxfy/src/ssr/hydration.ts`
- Test: `packages/rxfy/src/ssr/hydration.test.ts`
- Modify: `packages/rxfy/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/rxfy/src/ssr/hydration.test.ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { dehydrate, hydrate } from "./hydration.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

describe("dehydrate", () => {
  it("serializes query entries and named model stores", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });

    expect(dehydrate(registry)).toEqual({
      queries: { "todos:{}": { status: "fulfilled", value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "A" } } },
    });
  });

  it("is JSON round-trip safe", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.set("k", { status: "rejected", error: { name: "Error", message: "boom" } });
    const state = dehydrate(registry);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("warns once for an unnamed store holding data and skips it", () => {
    const unnamed = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
    const registry = createModelRegistry();
    registry.model(unnamed).set("1", { id: "1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = dehydrate(registry);
    expect(state.models).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("hydrate", () => {
  it("restores queries and model stores into a fresh registry", () => {
    const source = createModelRegistry();
    source.model(todoModel).set("1", { id: "1", title: "A" });
    source.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });

    const target = createModelRegistry();
    hydrate(target, dehydrate(source));

    expect(target.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["1"] } });
    // store not created yet — created on first model() call, seeded from stash
    expect(target.model(todoModel).getValue("1")).toEqual({ id: "1", title: "A" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/ssr/hydration.test.ts`
Expected: FAIL — cannot find module `./hydration.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy/src/ssr/hydration.ts
import type { IModelRegistry } from "../model/model-store.js";
import type { QueryEntry } from "../query/query-cache.js";

export type DehydratedState = {
  queries: Record<string, QueryEntry>;
  models: Record<string, Record<string, unknown>>;
};

/** Serializes the registry's query cache (ids) and named model stores (entities) to a JSON-safe snapshot. */
export function dehydrate(registry: IModelRegistry): DehydratedState {
  const queries: DehydratedState["queries"] = {};
  for (const [key, entry] of registry.queries.entries()) {
    queries[key] = entry;
  }

  const models: DehydratedState["models"] = {};
  const named = registry.namedStores();
  for (const [name, store] of named) {
    models[name] = Object.fromEntries(store.valueEntries());
  }

  for (const { descriptor, store } of registry.stores()) {
    if (!descriptor.name && store.valueEntries().length > 0) {
      console.warn("rxfy: model store holds data but has no name — it will not be dehydrated for SSR");
    }
  }

  return { queries, models };
}

/** Ingests a dehydrated snapshot: model entities → stores (via stash), query entries → cache. */
export function hydrate(registry: IModelRegistry, state: DehydratedState): void {
  for (const [name, entities] of Object.entries(state.models)) {
    registry.stashHydration(name, entities);
  }
  for (const [key, entry] of Object.entries(state.queries)) {
    registry.queries.set(key, entry);
  }
}
```

- [ ] **Step 4: Export new modules from the core index**

In `packages/rxfy/src/index.ts`, add:

```ts
export * from "./query/query-cache.js";
export * from "./query/stable-stringify.js";
export * from "./ssr/hydration.js";
export * from "./ssr/serialize.js";
export * from "./ssr/sync-marker.js";
export * from "./state/normalize.js";
```

- [ ] **Step 5: Run all core tests and build**

Run: `pnpm --filter rxfy exec vitest run && pnpm --filter rxfy build && pnpm --filter rxfy check-types`
Expected: all PASS, build emits dist with new exports

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy/src/ssr/hydration.ts packages/rxfy/src/ssr/hydration.test.ts packages/rxfy/src/index.ts
git commit -m "feat(rxfy): add dehydrate/hydrate and export SSR modules"
```

---

### Task 10: `StoreProvider` SSR props + `SsrContext` + window ingest (react)

**Files:**

- Modify: `packages/rxfy-react/src/StoreProvider.tsx`
- Modify: `packages/rxfy-react/src/index.tsx` (export `SsrContext`)
- Test: `packages/rxfy-react/src/StoreProvider.test.tsx` (extend)

- [ ] **Step 1: Build core first**

Run: `pnpm --filter rxfy build`

- [ ] **Step 2: Write the failing tests**

Append to `packages/rxfy-react/src/StoreProvider.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { createModel, createModelRegistry, type DehydratedState } from "rxfy";
import { z } from "zod";
import { useModelRegistry } from "./registry-context.js";
import { StoreProvider } from "./StoreProvider.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

describe("StoreProvider SSR props", () => {
  it("uses an externally provided registry", () => {
    const registry = createModelRegistry();
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider registry={registry}>{children}</StoreProvider>,
    });
    expect(result.current).toBe(registry);
  });

  it("hydrates dehydratedState into the registry", () => {
    const dehydrated: DehydratedState = {
      queries: { "todos:{}": { status: "fulfilled", value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "Hydrated" } } },
    };
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider dehydratedState={dehydrated}>{children}</StoreProvider>,
    });
    expect(result.current.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["1"] } });
    expect(result.current.model(todoModel).getValue("1")).toEqual({ id: "1", title: "Hydrated" });
  });

  it("ingests window.__RXFY_SSR__ chunks, including late pushes", () => {
    window.__RXFY_SSR__ = [{ queries: {}, models: { todo: { "1": { id: "1", title: "Early" } } } }];
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider ssr>{children}</StoreProvider>,
    });
    expect(result.current.model(todoModel).getValue("1")).toEqual({ id: "1", title: "Early" });

    window.__RXFY_SSR__!.push({ queries: {}, models: { todo: { "2": { id: "2", title: "Late" } } } });
    expect(result.current.model(todoModel).getValue("2")).toEqual({ id: "2", title: "Late" });
    delete window.__RXFY_SSR__;
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter rxfy-react exec vitest run src/StoreProvider.test.tsx`
Expected: FAIL — `registry`/`dehydratedState` props rejected, `window.__RXFY_SSR__` type missing

- [ ] **Step 4: Write the implementation**

Replace `packages/rxfy-react/src/StoreProvider.tsx`:

```tsx
import { createContext, type PropsWithChildren, useState } from "react";
import { createModelRegistry, type DehydratedState, hydrate, type IModelRegistry } from "rxfy";
import { ModelRegistryContext } from "./registry-context.js";

/** True when the app opted into SSR — gates useStateData's server-side Suspense behavior. */
export const SsrContext = createContext(false);

declare global {
  interface Window {
    /** Push protocol for streamed hydration chunks (see rxfy-react/next HydrationStream). */
    __RXFY_SSR__?: DehydratedState[];
  }
}

export type StoreProviderProps = PropsWithChildren<{
  /** Enables server-side fetch-and-suspend in useStateData. Pass the same value on server and client. */
  ssr?: boolean;
  /** Per-request registry created by server code so it can dehydrate after rendering. */
  registry?: IModelRegistry;
  /** Snapshot from dehydrate() for prop-based hydration (buffered/two-pass SSR). */
  dehydratedState?: DehydratedState;
}>;

export function StoreProvider({ children, ssr = false, registry: external, dehydratedState }: StoreProviderProps) {
  const [registry] = useState(() => {
    const r = external ?? createModelRegistry();
    if (dehydratedState) hydrate(r, dehydratedState);
    ingestWindowState(r);
    return r;
  });

  return (
    <ModelRegistryContext.Provider value={registry}>
      <SsrContext.Provider value={ssr}>{children}</SsrContext.Provider>
    </ModelRegistryContext.Provider>
  );
}

function ingestWindowState(registry: IModelRegistry): void {
  if (typeof window === "undefined") return;
  const queue = (window.__RXFY_SSR__ = window.__RXFY_SSR__ ?? []);
  for (const chunk of queue) hydrate(registry, chunk);
  // Late-streamed chunks (Suspense boundaries resolving after hydration) flow straight into the registry.
  queue.push = (...chunks: DehydratedState[]) => {
    for (const chunk of chunks) hydrate(registry, chunk);
    return queue.length;
  };
}
```

In `packages/rxfy-react/src/index.tsx`, update the StoreProvider export line:

```ts
export { SsrContext, StoreProvider } from "./StoreProvider.js";
export type { StoreProviderProps } from "./StoreProvider.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter rxfy-react exec vitest run src/StoreProvider.test.tsx`
Expected: PASS (existing + 3 new tests)

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-react/src/StoreProvider.tsx packages/rxfy-react/src/StoreProvider.test.tsx packages/rxfy-react/src/index.tsx
git commit -m "feat(rxfy-react): add ssr, registry, dehydratedState props to StoreProvider"
```

---

### Task 11: `usePending` sync probe + attached reload (react)

Two changes: (1) on first render, probe sync-marked sources so hydrated data renders fulfilled immediately (server HTML and client first paint become byte-identical); (2) `onReload` prefers a reload callback attached to the source (set by `useStateData` — deletes the cache entry) over the internal re-subscribe nonce.

**Files:**

- Modify: `packages/rxfy-react/src/usePending.ts`
- Test: `packages/rxfy-react/src/usePending.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/rxfy-react/src/usePending.test.tsx
import { renderHook } from "@testing-library/react";
import { attachReload, markSync } from "rxfy";
import { BehaviorSubject, Observable, of, Subject, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { usePending } from "./usePending.js";

describe("usePending sync probe", () => {
  it("starts fulfilled for a sync-marked source that emits synchronously", () => {
    const source$ = markSync(new BehaviorSubject(42));
    const { result } = renderHook(() => usePending(source$));
    // first render — no effects flushed yet — must already be fulfilled (hydration correctness)
    expect(result.current).toEqual({ status: "fulfilled", value: 42 });
  });

  it("starts rejected for a sync-marked source that errors synchronously", () => {
    const source$ = markSync(throwError(() => new Error("boom")));
    const { result } = renderHook(() => usePending(source$));
    expect(result.current.status).toBe("rejected");
  });

  it("starts pending for unmarked sources (unchanged behavior)", () => {
    const { result } = renderHook(() => usePending(new Subject<number>()));
    expect(result.current).toEqual({ status: "pending" });
  });

  it("does not subscribe unmarked cold observables during the probe", () => {
    let subscriptions = 0;
    const cold$ = new Observable<number>(() => {
      subscriptions += 1;
    });
    renderHook(() => usePending(cold$));
    // exactly one subscription — from the pipeline, not the probe
    expect(subscriptions).toBe(1);
  });

  it("onReload calls the attached reload instead of re-subscribing", async () => {
    const reload = vi.fn();
    const source$ = attachReload(markSync(throwError(() => new Error("boom"))), reload);
    const { result } = renderHook(() => usePending(source$));
    expect(result.current.status).toBe("rejected");
    if (result.current.status === "rejected") result.current.onReload();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("still resolves async sources (unchanged behavior)", async () => {
    const { result } = renderHook(() => usePending(of(7)));
    await vi.waitFor(() => expect(result.current).toEqual({ status: "fulfilled", value: 7 }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy-react exec vitest run src/usePending.test.tsx`
Expected: FAIL — sync-marked source starts `pending` instead of `fulfilled`

- [ ] **Step 3: Write the implementation**

Replace `packages/rxfy-react/src/usePending.ts`:

```ts
import _ from "lodash";
import { useCallback, useMemo, useState } from "react";
import { getAttachedReload, isSyncMarked } from "rxfy";
import {
  BehaviorSubject,
  catchError,
  concat,
  distinctUntilChanged,
  isObservable,
  map,
  Observable,
  of,
  switchMap,
} from "rxjs";
import { useObservable } from "./useObservable.js";

export type ObservableLike<T> = Observable<T> | T;

function toObservable<T>(val: ObservableLike<T>): Observable<T> {
  if (isObservable(val)) return val;
  return of(val);
}

type Status = "pending" | "rejected" | "fulfilled";

export type IPendingStatus<T, K extends Status = Status> = {
  pending: { status: "pending" };
  rejected: { status: "rejected"; error: unknown; onReload: () => void };
  fulfilled: { status: "fulfilled"; value: T };
}[K];

type ProbeResult<T> = { kind: "value"; value: T } | { kind: "error"; error: unknown } | null;

/**
 * Render-time probe for sync-marked sources (hydrated query state, seeded model stores).
 * Subscribes and immediately unsubscribes — only rxfy-controlled observables are marked,
 * so this never triggers user side effects.
 */
function probeSync<T>(source: ObservableLike<T>): ProbeResult<T> {
  if (!isObservable(source) || !isSyncMarked(source)) return null;
  let captured: ProbeResult<T> = null;
  const sub = source.subscribe({
    next: (value) => (captured = { kind: "value", value }),
    error: (error) => (captured = { kind: "error", error }),
  });
  sub.unsubscribe();
  return captured;
}

export function usePending<T>(source$: ObservableLike<T>, getDefaultValue?: () => T): IPendingStatus<T> {
  const [nonce$] = useState(() => new BehaviorSubject(0));
  const [initialProbe] = useState(() => probeSync(source$));

  const reload = useCallback(() => {
    const attached = isObservable(source$) ? getAttachedReload(source$) : undefined;
    if (attached) attached();
    else nonce$.next(nonce$.getValue() + 1);
  }, [source$, nonce$]);

  const target$ = useMemo(
    () =>
      nonce$.pipe(
        switchMap(() => {
          const emitsSync = isObservable(source$) && isSyncMarked(source$);
          const pendingEmission = getDefaultValue || emitsSync ? [] : [of<IPendingStatus<T>>({ status: "pending" })];
          return concat(
            ...pendingEmission,
            toObservable(source$).pipe(
              map((value): IPendingStatus<T> => ({ status: "fulfilled", value })),
              catchError((error) =>
                of<IPendingStatus<T>>({
                  status: "rejected",
                  error,
                  onReload: reload,
                }),
              ),
            ),
          );
        }),
        distinctUntilChanged(_.isEqual),
      ),
    [source$, nonce$, getDefaultValue, reload],
  );

  const initialState = useMemo<IPendingStatus<T>>(() => {
    if (initialProbe?.kind === "value") return { status: "fulfilled", value: initialProbe.value };
    if (initialProbe?.kind === "error") return { status: "rejected", error: initialProbe.error, onReload: reload };
    if (getDefaultValue) return { status: "fulfilled", value: getDefaultValue() };
    return { status: "pending" };
  }, [initialProbe, getDefaultValue, reload]);

  return useObservable(target$, initialState);
}
```

Note: `distinctUntilChanged(_.isEqual)` compares `onReload` functions as not-equal only if other fields differ — `_.isEqual` ignores function identity, so re-emissions of an identical rejected status are still deduplicated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy-react exec vitest run src/usePending.test.tsx src/Pending.test.tsx`
Expected: PASS (new tests + existing Pending tests unchanged)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/usePending.ts packages/rxfy-react/src/usePending.test.tsx
git commit -m "feat(rxfy-react): sync probe and attached reload in usePending"
```

---

### Task 12: `useStateData` — normalized client path (react)

`data$` now emits ids (`QueryShapeOf<TShape>`); mutations and `set` accept full entities and run denormalize → reduce → normalize. This task implements the full new hook body (including the cache/SSR branches — they are exercised by Tasks 13–14's tests) and updates the existing test file to the normalized shape.

**Files:**

- Modify: `packages/rxfy-react/src/useStateData.ts`
- Modify: `packages/rxfy-react/src/useStateData.test.tsx`

- [ ] **Step 1: Update the existing test file to the normalized shape**

Replace `packages/rxfy-react/src/useStateData.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { array, createModel, defineState, single } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";
import { useStateData } from "./useStateData.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });
const userModel = createModel(z.object({ id: z.string(), name: z.string() }), { getKey: (x) => x.id, name: "user" });

type Post = { id: string; title: string };

const pageState = defineState({
  key: "page",
  params: z.object({ page: z.number() }),
  model: { posts: array(postModel) },
  mutations: {
    addPost: (prev, post: Post) => ({ ...prev, posts: [...prev.posts, post] }),
    removePost: (prev, id: string) => ({ ...prev, posts: prev.posts.filter((p) => p.id !== id) }),
  },
});

const singleState = defineState({
  params: z.object({ id: z.string() }),
  model: { user: single(userModel) },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateData", () => {
  it("emits normalized ids for array fields", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [
        { id: "1", title: "Post 1" },
        { id: "2", title: "Post 2" },
      ],
    });

    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["1", "2"]);
    expect(fetchFn).toHaveBeenCalledWith({ page: 0 }, expect.any(AbortSignal));
  });

  it("emits a normalized id for single fields", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ user: { id: "u1", name: "Ann" } });
    const { result } = renderHook(() => useStateData(singleState, fetchFn, { id: "u1" }), { wrapper });
    const data = await firstValueFrom(result.current.data$);
    expect(data.user).toBe("u1");
  });

  it("returns new handle when params change", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params0 = { page: 0 };
    const params1 = { page: 1 };

    const { result, rerender } = renderHook(({ params }) => useStateData(pageState, fetchFn, params), {
      wrapper,
      initialProps: { params: params0 },
    });

    const first = result.current;
    rerender({ params: params1 });
    expect(result.current).not.toBe(first);
  });

  it("returns same handle when params reference is stable", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params = { page: 0 };

    const { result, rerender } = renderHook(() => useStateData(pageState, fetchFn, params), { wrapper });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("normalizes fetched entities into model stores", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "42", title: "Stored" }] });

    const { result } = renderHook(
      () => ({
        handle: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );

    await firstValueFrom(result.current.handle.data$);
    expect(result.current.postStore.getValue("42")).toEqual({ id: "42", title: "Stored" });
  });

  it("mutations accept full entities: denormalize → reduce → normalize", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
    const { result } = renderHook(
      () => ({
        handle: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );
    await firstValueFrom(result.current.handle.data$);

    act(() => result.current.handle.mutations.addPost({ id: "2", title: "B" }));

    const data = await firstValueFrom(result.current.handle.data$);
    expect(data.posts).toEqual(["1", "2"]);
    // entity landed in the model store via normalize — no manual store.set needed
    expect(result.current.postStore.getValue("2")).toEqual({ id: "2", title: "B" });
  });

  it("mutation reducers see the freshest store values (websocket scenario)", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "Original" }] });
    let seenTitle = "";
    const spyState = defineState({
      params: z.object({}),
      model: { posts: array(postModel) },
      mutations: {
        touch: (prev) => {
          seenTitle = prev.posts[0].title;
          return prev;
        },
      },
    });
    const { result } = renderHook(
      () => ({
        handle: useStateData(spyState, fetchFn, {}),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );
    await firstValueFrom(result.current.handle.data$);

    // simulate a websocket write
    act(() => result.current.postStore.set("1", { id: "1", title: "From socket" }));
    act(() => result.current.handle.mutations.touch());

    expect(seenTitle).toBe("From socket");
  });

  it("set() accepts the full fetch shape", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });
    await firstValueFrom(result.current.data$);

    act(() => result.current.set({ posts: [{ id: "9", title: "Replaced" }] }));

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["9"]);
  });

  it("set() with an updater receives denormalized entities", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });
    await firstValueFrom(result.current.data$);

    let seen: Post[] = [];
    act(() =>
      result.current.set((prev) => {
        seen = prev.posts;
        return prev;
      }),
    );

    expect(seen).toEqual([{ id: "1", title: "A" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new expectations fail**

Run: `pnpm --filter rxfy-react exec vitest run src/useStateData.test.tsx`
Expected: FAIL — `data.posts` contains entity objects, not ids

- [ ] **Step 3: Write the implementation**

Replace `packages/rxfy-react/src/useStateData.ts`:

```ts
import { useContext, useMemo, useState } from "react";
import type { FieldsMap, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import {
  attachReload,
  denormalizeValue,
  markSync,
  normalizeResult,
  rehydrateError,
  serializeError,
  stableStringify,
} from "rxfy";
import { BehaviorSubject, filter, Observable, Subscription } from "rxjs";
import { useModelRegistry } from "./registry-context.js";
import { SsrContext } from "./StoreProvider.js";

export type BoundMutations<TShape, TMutations extends MutationDefs<TShape>> = {
  [K in keyof TMutations]: TMutations[K] extends (prev: TShape, ...args: infer A) => TShape
    ? (...args: A) => void
    : never;
};

export type StateHandle<TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  /** Normalized query state — entity ids only. Read entity data through model stores. */
  readonly data$: Observable<QueryShapeOf<TShape>>;
  readonly set: (value: TShape | ((prev: TShape) => TShape)) => void;
  readonly reload: () => void;
  readonly mutations: BoundMutations<TShape, TMutations>;
};

export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): StateHandle<TShape, TMutations> {
  const registry = useModelRegistry();
  const ssr = useContext(SsrContext);
  const [reloadCounter, setReloadCounter] = useState(0);

  return useMemo(() => {
    // reloadCounter is used here only to trigger a new handle when reload() is called
    void reloadCounter;
    const fields = state.fields as FieldsMap;
    const cacheKey = state.key ? `${state.key}:${stableStringify(params)}` : undefined;
    const isServer = typeof window === "undefined";
    const cached = cacheKey ? registry.queries.get(cacheKey) : undefined;

    // SSR on-demand fetching: suspend on cache miss; React re-renders when the promise settles.
    if (isServer && ssr && !cached) {
      if (!cacheKey) {
        console.warn('rxfy: state without "key" cannot be fetched during SSR — falling back to client fetch');
      } else {
        const inflight = registry.queries.getPromise(cacheKey);
        if (inflight) throw inflight; // dedup: another component already started this fetch
        const promise = fetchFn(params, new AbortController().signal).then(
          (result) => {
            // normalize BEFORE the re-render so model-store subscriptions are live during SSR
            registry.queries.set(cacheKey, { status: "fulfilled", value: normalizeResult(registry, fields, result) });
          },
          (error: unknown) => {
            registry.queries.set(cacheKey, { status: "rejected", error: serializeError(error) });
          },
        );
        registry.queries.setPromise(cacheKey, promise);
        throw promise;
      }
    }

    const initialIds = cached?.status === "fulfilled" ? (cached.value as QueryShapeOf<TShape>) : null;
    // subject is shared between data$, set(), and mutations via closure
    const subject = new BehaviorSubject<QueryShapeOf<TShape> | null>(initialIds);
    const notNull = filter((v: QueryShapeOf<TShape> | null): v is QueryShapeOf<TShape> => v !== null);

    const writeThrough = (ids: QueryShapeOf<TShape>) => {
      subject.next(ids);
      if (cacheKey) registry.queries.set(cacheKey, { status: "fulfilled", value: ids });
    };

    let data$: Observable<QueryShapeOf<TShape>>;
    if (cached?.status === "rejected") {
      // hydrated rejection: error synchronously; entry persists until reload() deletes it
      const error = cached.error;
      data$ = markSync(
        new Observable<QueryShapeOf<TShape>>((subscriber) => {
          subscriber.error(rehydrateError(error));
        }),
      );
    } else if (initialIds !== null) {
      // cache hit: emit synchronously, no fetch
      data$ = markSync(subject.pipe(notNull));
    } else {
      // miss: fetch on subscribe (current behavior), normalize + write through on settle
      data$ = new Observable<QueryShapeOf<TShape>>((subscriber) => {
        let innerSub: Subscription | undefined;
        const controller = new AbortController();

        fetchFn(params, controller.signal)
          .then((result) => {
            if (subscriber.closed) return;
            writeThrough(normalizeResult(registry, fields, result));
            innerSub = subject.pipe(notNull).subscribe(subscriber);
          })
          .catch((err: unknown) => {
            if (!subscriber.closed) subscriber.error(err);
          });

        return () => {
          controller.abort();
          innerSub?.unsubscribe();
        };
      });
    }

    const applyUpdate = (updater: (prev: TShape) => TShape) => {
      const currentIds = subject.getValue();
      if (currentIds === null) return;
      const prev = denormalizeValue<TShape>(registry, fields, currentIds);
      writeThrough(normalizeResult(registry, fields, updater(prev)));
    };

    const set = (valueOrUpdater: TShape | ((prev: TShape) => TShape)) => {
      if (typeof valueOrUpdater === "function") {
        applyUpdate(valueOrUpdater as (prev: TShape) => TShape);
      } else {
        writeThrough(normalizeResult(registry, fields, valueOrUpdater));
      }
    };

    const mutations = Object.fromEntries(
      Object.entries(state.mutations).map(([key, reducer]) => [
        key,
        (...args: unknown[]) =>
          applyUpdate((prev) => (reducer as (prev: TShape, ...a: unknown[]) => TShape)(prev, ...args)),
      ]),
    ) as BoundMutations<TShape, TMutations>;

    const reload = () => {
      if (cacheKey) registry.queries.delete(cacheKey);
      setReloadCounter((c) => c + 1);
    };

    attachReload(data$, reload);

    return { data$, set, reload, mutations };
  }, [params, fetchFn, reloadCounter, state, registry, ssr]);
}
```

- [ ] **Step 4: Run the full rxfy-react suite**

Run: `pnpm --filter rxfy-react exec vitest run`
Expected: PASS — useStateData tests green; index/Pending/StoreProvider/registry tests unaffected

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/useStateData.test.tsx
git commit -m "feat(rxfy-react)!: normalized data$ (ids) with entity-shaped mutations and set"
```

---

### Task 13: `useStateData` — cache hit, write-through, reload, rejected hydration (react)

Behavioral tests for the cache paths implemented in Task 12. These run in jsdom (client semantics).

**Files:**

- Create: `packages/rxfy-react/src/useStateData.cache.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
// packages/rxfy-react/src/useStateData.cache.test.tsx
import { act, renderHook } from "@testing-library/react";
import { array, createModel, createModelRegistry, defineState, type IModelRegistry } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";
import { useStateData } from "./useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

type Todo = { id: string; title: string };

const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});

function makeWrapper(registry: IModelRegistry) {
  return ({ children }: { children: React.ReactNode }) => <StoreProvider registry={registry}>{children}</StoreProvider>;
}

function seedFulfilled(registry: IModelRegistry) {
  registry.model(todoModel).set("1", { id: "1", title: "Hydrated" });
  registry.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });
}

describe("useStateData cache integration", () => {
  it("cache hit: emits synchronously without calling fetchFn", async () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn();

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });

    let sync: unknown;
    result.current.data$.subscribe((v) => (sync = v)).unsubscribe();
    expect(sync).toEqual({ todos: ["1"] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("client fetch settle writes the result through to the cache", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "9", title: "Fetched" }] });

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    await firstValueFrom(result.current.data$);

    expect(registry.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["9"] } });
  });

  it("mutations write through to the cache (remounts see mutated data)", async () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn();

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    act(() => result.current.mutations.addTodo({ id: "2", title: "New" }));

    expect(registry.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["1", "2"] } });
    expect(registry.model(todoModel).getValue("2")).toEqual({ id: "2", title: "New" });
  });

  it("remount on cache hit does not clobber fresher store values (normalize on write, never on read)", async () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn();
    const wrapper = makeWrapper(registry);

    const first = renderHook(() => useStateData(todosState, fetchFn, {}), { wrapper });
    first.unmount();

    // websocket-style write between mounts
    registry.model(todoModel).set("1", { id: "1", title: "From socket" });

    const second = renderHook(
      () => ({ handle: useStateData(todosState, fetchFn, {}), store: useModelStore(todoModel) }),
      { wrapper },
    );
    const data = await firstValueFrom(second.result.current.handle.data$);
    expect(data).toEqual({ todos: ["1"] });
    expect(second.result.current.store.getValue("1")).toEqual({ id: "1", title: "From socket" });
  });

  it("reload() deletes the cache entry and re-fetches", async () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "1", title: "Fresh" }] });

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    act(() => result.current.reload());

    const data = await firstValueFrom(result.current.data$);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(data).toEqual({ todos: ["1"] });
    expect(registry.model(todoModel).getValue("1")).toEqual({ id: "1", title: "Fresh" });
  });

  it("hydrated rejection: data$ errors synchronously with a rehydrated Error", () => {
    const registry = createModelRegistry();
    registry.queries.set("todos:{}", { status: "rejected", error: { name: "FetchError", message: "boom" } });
    const fetchFn = vi.fn();

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });

    let caught: unknown;
    result.current.data$.subscribe({ error: (e) => (caught = e) }).unsubscribe();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("FetchError");
    expect((caught as Error).message).toBe("boom");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("states without a key never touch the cache", async () => {
    const keylessState = defineState({ params: z.object({}), model: { todos: array(todoModel) } });
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [] });

    const { result } = renderHook(() => useStateData(keylessState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    await firstValueFrom(result.current.data$);

    expect(registry.queries.entries()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter rxfy-react exec vitest run src/useStateData.cache.test.tsx`
Expected: PASS (8 tests) — the implementation landed in Task 12; failures here indicate Task 12 bugs to fix now

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-react/src/useStateData.cache.test.tsx
git commit -m "test(rxfy-react): cover query cache hit, write-through, reload, rejected hydration"
```

---

### Task 14: `useStateData` — server suspend + dedup (react, node env)

Server semantics require `typeof window === "undefined"`, so this file runs in the node environment via a vitest pragma. No DOM, no testing-library — render with `react-dom/server`.

**Files:**

- Create: `packages/rxfy-react/src/useStateData.server.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
// @vitest-environment node
// packages/rxfy-react/src/useStateData.server.test.tsx
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState, type IModelRegistry } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "./Pending.js";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
});

function TodoWidget({
  fetchFn,
}: {
  fetchFn: (params: object, signal: AbortSignal) => Promise<{ todos: { id: string; title: string }[] }>;
}) {
  const { data$ } = useStateData(todosState, fetchFn, {});
  return (
    <Pending value$={data$}>
      {({ todos }) => (
        <ul>
          {todos.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </Pending>
  );
}

function renderApp(registry: IModelRegistry, fetchFn: Parameters<typeof TodoWidget>[0]["fetchFn"], widgets = 1) {
  return renderToString(
    <StoreProvider registry={registry} ssr>
      <Suspense fallback="loading">
        {Array.from({ length: widgets }, (_, i) => (
          <TodoWidget key={i} fetchFn={fetchFn} />
        ))}
      </Suspense>
    </StoreProvider>,
  );
}

describe("useStateData server suspend (ssr mode)", () => {
  it("cache miss: calls fetchFn, stores the in-flight promise, and suspends", () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => {}));

    const html = renderApp(registry, fetchFn);

    expect(html).toContain("loading"); // renderToString renders the fallback for suspended boundaries
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(registry.queries.inflight()).toHaveLength(1);
  });

  it("dedup: two components with the same key cause one fetch", () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => {}));

    renderApp(registry, fetchFn, 2);

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("after settle, re-render produces fulfilled HTML from the cache", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "1", title: "A" }] });

    renderApp(registry, fetchFn); // first pass — suspends, promise stored
    await Promise.all(registry.queries.inflight());

    const html = renderApp(registry, fetchFn); // second pass — cache hit
    expect(html).toContain("<li>1</li>");
    expect(fetchFn).toHaveBeenCalledOnce();
    // entities normalized at settle — model store seeded
    expect(registry.model(todoModel).getValue("1")).toEqual({ id: "1", title: "A" });
  });

  it("fetch rejection is captured as a serialized rejected entry", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("backend down"));

    renderApp(registry, fetchFn);
    await Promise.all(registry.queries.inflight());

    expect(registry.queries.get("todos:{}")).toEqual({
      status: "rejected",
      error: { name: "TypeError", message: "backend down" },
    });
  });

  it("ssr=false: never suspends, never fetches on the server (backward compatible)", () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn();

    const html = renderToString(
      <StoreProvider registry={registry}>
        <TodoWidget fetchFn={fetchFn} />
      </StoreProvider>,
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(html).toBe(""); // Pending renders the default null pending state
  });

  it("keyless state in ssr mode warns and does not suspend", () => {
    const keyless = defineState({ params: z.object({}), model: { todos: array(todoModel) } });
    function Widget() {
      const { data$ } = useStateData(keyless, () => new Promise(() => {}), {});
      return <Pending value$={data$}>{() => null}</Pending>;
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderToString(
      <StoreProvider registry={createModelRegistry()} ssr>
        <Widget />
      </StoreProvider>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('without "key"'));
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter rxfy-react exec vitest run src/useStateData.server.test.tsx`
Expected: PASS (6 tests). Note: `usePending`'s sync probe makes the post-settle pass render fulfilled HTML — if `<li>1</li>` is missing, the probe (Task 11) or sync marking (Task 12) is broken.

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-react/src/useStateData.server.test.tsx
git commit -m "test(rxfy-react): cover SSR suspend, dedup, rejection capture in node env"
```

### Task 15: `collectStateData` two-pass helper (react)

For strict `renderToString` environments without stream APIs: render → await in-flight fetches → render again until nothing suspends.

**Files:**

- Create: `packages/rxfy-react/src/ssr/collect-state-data.ts`
- Test: `packages/rxfy-react/src/ssr/collect-state-data.test.tsx`
- Modify: `packages/rxfy-react/src/index.tsx` (export)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment node
// packages/rxfy-react/src/ssr/collect-state-data.test.tsx
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "../Pending.js";
import { StoreProvider } from "../StoreProvider.js";
import { useStateData } from "../useStateData.js";
import { collectStateData } from "./collect-state-data.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });
const todosState = defineState({ key: "todos", params: z.object({}), model: { todos: array(todoModel) } });

describe("collectStateData", () => {
  it("loops render passes until all fetches settle, returning fulfilled HTML", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "1", title: "A" }] });

    function App() {
      const { data$ } = useStateData(todosState, fetchFn, {});
      return (
        <Pending value$={data$}>
          {({ todos }) => (
            <ul>
              {todos.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          )}
        </Pending>
      );
    }

    const html = await collectStateData(registry, () =>
      renderToString(
        <StoreProvider registry={registry} ssr>
          <Suspense fallback="loading">
            <App />
          </Suspense>
        </StoreProvider>,
      ),
    );

    expect(html).toContain("<li>1</li>");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("returns immediately when nothing suspends", async () => {
    const registry = createModelRegistry();
    const render = vi.fn().mockReturnValue("<div>static</div>");
    const html = await collectStateData(registry, render);
    expect(html).toBe("<div>static</div>");
    expect(render).toHaveBeenCalledOnce();
  });

  it("rethrows render errors unrelated to suspension", async () => {
    const registry = createModelRegistry();
    await expect(
      collectStateData(registry, () => {
        throw new Error("render bug");
      }),
    ).rejects.toThrow("render bug");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy-react exec vitest run src/ssr/collect-state-data.test.tsx`
Expected: FAIL — cannot find module `./collect-state-data.js`

- [ ] **Step 3: Write the implementation**

```ts
// packages/rxfy-react/src/ssr/collect-state-data.ts
import type { IModelRegistry } from "rxfy";

/**
 * Two-pass SSR for strict renderToString environments (the Apollo getDataFromTree pattern):
 * render → await fetches that suspended into the registry's query cache → render again,
 * until a pass completes with nothing in flight. Each waterfall level costs one extra pass.
 */
export async function collectStateData(registry: IModelRegistry, render: () => string): Promise<string> {
  for (;;) {
    let html: string;
    try {
      html = render();
    } catch (error) {
      // React throws when a component suspends without a boundary; if fetches are in
      // flight this render registered them — await and retry. Otherwise it's a real error.
      const inflight = registry.queries.inflight();
      if (inflight.length === 0) throw error;
      await Promise.allSettled(inflight);
      continue;
    }
    const inflight = registry.queries.inflight();
    if (inflight.length === 0) return html;
    await Promise.allSettled(inflight);
  }
}
```

In `packages/rxfy-react/src/index.tsx`, add:

```ts
export { collectStateData } from "./ssr/collect-state-data.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy-react exec vitest run src/ssr/collect-state-data.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/ssr/ packages/rxfy-react/src/index.tsx
git commit -m "feat(rxfy-react): add collectStateData two-pass SSR helper"
```

---

### Task 16: Buffered `renderToPipeableStream` integration test (react, node env)

End-to-end round trip of the recommended non-Next SSR mode: stream-render with `onAllReady`, dehydrate, hydrate into a fresh registry, assert identical fulfilled markup and zero client fetches.

**Files:**

- Create: `packages/rxfy-react/src/ssr/buffered-ssr.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment node
// packages/rxfy-react/src/ssr/buffered-ssr.test.tsx
import { PassThrough } from "node:stream";
import { Suspense } from "react";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState, dehydrate, type IModelRegistry } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "../Pending.js";
import { StoreProvider } from "../StoreProvider.js";
import { useModelStore } from "../useModelStore.js";
import { useStateData } from "../useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });
const todosState = defineState({ key: "todos", params: z.object({}), model: { todos: array(todoModel) } });

function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  return <Pending value$={store.get(id)}>{(todo) => <li>{todo.title}</li>}</Pending>;
}

function App({
  fetchFn,
}: {
  fetchFn: (p: object, s: AbortSignal) => Promise<{ todos: { id: string; title: string }[] }>;
}) {
  const { data$ } = useStateData(todosState, fetchFn, {});
  return (
    <Suspense fallback="loading">
      <Pending value$={data$}>
        {({ todos }) => (
          <ul>
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </Suspense>
  );
}

function streamToString(registry: IModelRegistry, fetchFn: Parameters<typeof App>[0]["fetchFn"]): Promise<string> {
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StoreProvider registry={registry} ssr>
        <App fetchFn={fetchFn} />
      </StoreProvider>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => resolve(html));
          pipe(sink);
        },
        onError: reject,
      },
    );
  });
}

describe("buffered SSR (renderToPipeableStream + onAllReady)", () => {
  it("server fetches on demand, dehydrates, and the client renders identical HTML with zero fetches", async () => {
    const serverRegistry = createModelRegistry();
    const serverFetch = vi.fn().mockResolvedValue({
      todos: [
        { id: "1", title: "Buy milk" },
        { id: "2", title: "Walk dog" },
      ],
    });

    const serverHtml = await streamToString(serverRegistry, serverFetch);
    expect(serverHtml).toContain("Buy milk");
    expect(serverHtml).toContain("Walk dog");
    expect(serverFetch).toHaveBeenCalledOnce();

    // simulate the server→client JSON round trip
    const payload = JSON.parse(JSON.stringify(dehydrate(serverRegistry)));

    // "client": fresh registry hydrated from the payload; renderToString = first paint, no effects
    const clientRegistry = createModelRegistry();
    const clientFetch = vi.fn();
    const clientHtml = renderToString(
      <StoreProvider registry={clientRegistry} dehydratedState={payload}>
        <App fetchFn={clientFetch} />
      </StoreProvider>,
    );

    expect(clientFetch).not.toHaveBeenCalled();
    expect(clientHtml).toContain("Buy milk");
    expect(clientHtml).toContain("Walk dog");
  });

  it("rejected fetches hydrate as rejected state in the payload", async () => {
    const registry = createModelRegistry();
    const failing = vi.fn().mockRejectedValue(new Error("api down"));

    await streamToString(registry, failing);

    const payload = dehydrate(registry);
    expect(payload.queries["todos:{}"]).toEqual({
      status: "rejected",
      error: { name: "Error", message: "api down" },
    });
  });
});
```

Note: when a fetch rejects, the suspended boundary re-renders, `useStateData` finds the rejected entry, `data$` errors synchronously, `Pending` renders its `rejected` fallback (default `null`) — `onAllReady` still fires.

- [ ] **Step 2: Run the test**

Run: `pnpm --filter rxfy-react exec vitest run src/ssr/buffered-ssr.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-react/src/ssr/buffered-ssr.test.tsx
git commit -m "test(rxfy-react): buffered streaming SSR round-trip integration test"
```

---

### Task 17: `rxfy-react/next` subpath — `<HydrationStream />`

Next.js streaming adapter: flushes newly settled query entries and newly written model entities per stream flush as `<script>` tags using `useServerInsertedHTML`. `next` is an optional peer; a local type shim and a vitest alias avoid installing it.

**Files:**

- Create: `packages/rxfy-react/src/next/HydrationStream.tsx`
- Create: `packages/rxfy-react/src/next/index.ts`
- Create: `packages/rxfy-react/src/next/next-navigation.d.ts`
- Create: `packages/rxfy-react/src/next/next-navigation.stub.ts`
- Test: `packages/rxfy-react/src/next/HydrationStream.test.tsx`
- Modify: `packages/rxfy-react/package.json`, `packages/rxfy-react/tsup.config.ts`, `packages/rxfy-react/vitest.config.ts`

- [ ] **Step 1: Create the type shim and test stub**

```ts
// packages/rxfy-react/src/next/next-navigation.d.ts
declare module "next/navigation" {
  import type { ReactNode } from "react";
  export function useServerInsertedHTML(callback: () => ReactNode): void;
}
```

```ts
// packages/rxfy-react/src/next/next-navigation.stub.ts
// Test stand-in for next/navigation — collects insertion callbacks for assertions.
import type { ReactNode } from "react";

export const insertedCallbacks: (() => ReactNode)[] = [];

export function useServerInsertedHTML(callback: () => ReactNode): void {
  insertedCallbacks.push(callback);
}

export function resetInsertedCallbacks(): void {
  insertedCallbacks.length = 0;
}
```

In `packages/rxfy-react/vitest.config.ts`, add the alias:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "next/navigation": fileURLToPath(new URL("./src/next/next-navigation.stub.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./testSetup.ts",
  },
});
```

- [ ] **Step 2: Write the failing test**

```tsx
// @vitest-environment node
// packages/rxfy-react/src/next/HydrationStream.test.tsx
import { renderToString } from "react-dom/server";
import { createModel, createModelRegistry, type DehydratedState } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "../StoreProvider.js";
import { HydrationStream } from "./HydrationStream.js";
import { insertedCallbacks, resetInsertedCallbacks } from "./next-navigation.stub.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

function extractPayload(node: React.ReactNode): DehydratedState {
  const html = renderToString(<>{node}</>);
  const match = /__RXFY_SSR__\.push\((.*)\)<\/script>/.exec(html);
  expect(match).not.toBeNull();
  // renderToString HTML-escapes quotes inside attributes but not script bodies; payload is raw JSON
  return JSON.parse(match![1]) as DehydratedState;
}

describe("HydrationStream", () => {
  it("flushes new entries once and returns null when nothing changed", () => {
    resetInsertedCallbacks();
    const registry = createModelRegistry();

    renderToString(
      <StoreProvider registry={registry} ssr>
        <HydrationStream />
      </StoreProvider>,
    );
    expect(insertedCallbacks).toHaveLength(1);
    const flush = insertedCallbacks[0];

    // nothing in the registry yet → null
    expect(flush()).toBeNull();

    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });

    const first = extractPayload(flush());
    expect(first).toEqual({
      queries: { "todos:{}": { status: "fulfilled", value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "A" } } },
    });

    // same data → already flushed → null
    expect(flush()).toBeNull();

    // a later write flushes only the delta
    registry.model(todoModel).set("2", { id: "2", title: "B" });
    const second = extractPayload(flush());
    expect(second).toEqual({ queries: {}, models: { todo: { "2": { id: "2", title: "B" } } } });
  });

  it("escapes < in payloads", () => {
    resetInsertedCallbacks();
    const registry = createModelRegistry();
    renderToString(
      <StoreProvider registry={registry} ssr>
        <HydrationStream />
      </StoreProvider>,
    );
    registry.queries.set("k", { status: "fulfilled", value: "</script>" });
    const html = renderToString(<>{insertedCallbacks[0]()}</>);
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script>");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter rxfy-react exec vitest run src/next/HydrationStream.test.tsx`
Expected: FAIL — cannot find module `./HydrationStream.js`

- [ ] **Step 4: Write the implementation**

```tsx
// packages/rxfy-react/src/next/HydrationStream.tsx
import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";
import { dehydrate, type DehydratedState, serializeForHtml } from "rxfy";
import { useModelRegistry } from "../registry-context.js";

/**
 * Next.js App Router streaming adapter. Render once inside StoreProvider; each stream
 * flush emits newly settled queries / newly written entities as a window.__RXFY_SSR__
 * push — StoreProvider on the client ingests them, including late-arriving chunks.
 */
export function HydrationStream() {
  const registry = useModelRegistry();
  const flushedQueries = useRef(new Set<string>());
  const flushedEntities = useRef(new Set<string>());

  useServerInsertedHTML(() => {
    const full = dehydrate(registry);
    const delta: DehydratedState = { queries: {}, models: {} };
    let hasData = false;

    for (const [key, entry] of Object.entries(full.queries)) {
      if (flushedQueries.current.has(key)) continue;
      flushedQueries.current.add(key);
      delta.queries[key] = entry;
      hasData = true;
    }
    for (const [name, entities] of Object.entries(full.models)) {
      for (const [key, entity] of Object.entries(entities)) {
        const id = `${name}\u0000${key}`;
        if (flushedEntities.current.has(id)) continue;
        flushedEntities.current.add(id);
        (delta.models[name] ??= {})[key] = entity;
        hasData = true;
      }
    }

    if (!hasData) return null;
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__RXFY_SSR__=window.__RXFY_SSR__||[];window.__RXFY_SSR__.push(${serializeForHtml(delta)})`,
        }}
      />
    );
  });

  return null;
}
```

```ts
// packages/rxfy-react/src/next/index.ts
export { HydrationStream } from "./HydrationStream.js";
```

- [ ] **Step 5: Wire up the subpath build and packaging**

Replace `packages/rxfy-react/tsup.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig([
  {
    format: ["cjs", "esm"],
    dts: true,
    outDir: config.distDir,
    entry: {
      index: path.join(config.srcDir, "index.tsx"),
    },
  },
  {
    format: ["cjs", "esm"],
    dts: true,
    outDir: config.distDir,
    entry: {
      next: path.join(config.srcDir, "next/index.ts"),
    },
    external: ["next/navigation"],
    banner: { js: '"use client";' },
  },
]);
```

In `packages/rxfy-react/package.json`:

1. Replace the `exports` field:

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "default": "./dist/index.cjs"
  },
  "./next": {
    "import": "./dist/next.js",
    "types": "./dist/next.d.ts",
    "default": "./dist/next.cjs"
  }
},
```

2. Add `next` to `peerDependencies` and mark it optional:

```json
"peerDependencies": {
  "@types/react": "^18.0.0 || ^19.0.0",
  "lodash": "^4.0.0",
  "next": ">=14",
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0",
  "rxfy": "workspace:*"
},
"peerDependenciesMeta": {
  "next": {
    "optional": true
  }
},
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter rxfy-react exec vitest run src/next/HydrationStream.test.tsx && pnpm --filter rxfy-react build && pnpm --filter rxfy-react check-types`
Expected: tests PASS; build emits `dist/next.js`, `dist/next.cjs`, `dist/next.d.ts` with the `"use client"` banner

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-react/src/next/ packages/rxfy-react/package.json packages/rxfy-react/tsup.config.ts packages/rxfy-react/vitest.config.ts
git commit -m "feat(rxfy-react): add rxfy-react/next subpath with HydrationStream"
```

---

### Task 18: vite-todo migration — normalized state + buffered SSR

The example migrates to the id-shaped `data$`, single-call mutations, and the buffered `renderToPipeableStream` + `onAllReady` + `dehydrate` SSR mode. After this task, vite-todo is the working SSR demo: view-source shows rendered todos, the client does not re-fetch on load.

**Files:**

- Modify: `examples/vite-todo/src/todos.ts`
- Modify: `examples/vite-todo/src/App.tsx`
- Modify: `examples/vite-todo/src/entry-server.tsx`
- Modify: `examples/vite-todo/src/entry-client.tsx`
- Modify: `examples/vite-todo/server.ts`
- Modify: `examples/vite-todo/index.html`

- [ ] **Step 1: Update `todos.ts` — model name, state key, entity-shaped mutations**

In `examples/vite-todo/src/todos.ts`, replace the `todoModel` and `todosState` definitions (the rest of the file — `TodoSchema`, db, `fetchTodos`, `createTodo`, `toggleTodo` — stays unchanged):

```ts
export const todoModel = createModel(TodoSchema, { getKey: (x) => x.id, name: "todo" });
export const useTodoStore = () => useModelStore(todoModel);

export const todosState = defineState({
  key: "todos",
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
    removeTodo: (prev, id: string) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }),
  },
});
```

- [ ] **Step 2: Update `App.tsx` — ids from data$, single-call add**

Two changes in `examples/vite-todo/src/App.tsx`:

Replace `TodoListProps` and `TodoList`'s children render (ids instead of entities):

```tsx
type TodoListProps = {
  data$: Observable<{ todos: string[] }>;
};

function TodoList({ data$ }: TodoListProps) {
  return (
    <Pending
      value$={data$}
      pending={<p className="status">Loading…</p>}
      rejected={({ onReload }) => (
        <p className="status error">
          Failed to load. <button onClick={onReload}>Retry</button>
        </p>
      )}
    >
      {({ todos }) =>
        todos.length === 0 ? (
          <p className="status">No todos here.</p>
        ) : (
          <ul className="todo-list">
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )
      }
    </Pending>
  );
}
```

Replace `handleAdd` in `App` — the mutation now writes the entity to the model store automatically, so the manual `store.set` two-step disappears (remove the `useTodoStore` import/usage from `App`; `TodoItem` keeps its own):

```tsx
const handleAdd = (title: string) => {
  const todo = createTodo(title);
  // Newly added todos are active — don't add to the "done" filtered view
  if (filter !== "done") {
    mutations.addTodo(todo);
  }
};
```

Also remove the now-unused `Todo` type import and the `const store = useTodoStore();` line from `App` (keep them in `TodoItem`).

- [ ] **Step 3: Rewrite `entry-server.tsx` — buffered streaming + dehydrate**

Replace `examples/vite-todo/src/entry-server.tsx`:

```tsx
import { PassThrough } from "node:stream";
import { StrictMode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, serializeForHtml } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App";

export function render(_url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <App />
        </StoreProvider>
      </StrictMode>,
      {
        // buffered mode: wait for every Suspense boundary, then emit the full document at once
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => resolve({ html, state: serializeForHtml(dehydrate(registry)) }));
          pipe(sink);
        },
        onError(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );
  });
}
```

- [ ] **Step 4: Update `entry-client.tsx` — hydrate from the inline payload**

Replace `examples/vite-todo/src/entry-client.tsx`:

```tsx
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import type { DehydratedState } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App";
import "./index.css";

declare global {
  interface Window {
    __RXFY_STATE__?: DehydratedState;
  }
}

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr dehydratedState={window.__RXFY_STATE__}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Update `index.html` and `server.ts` — state placeholder**

In `examples/vite-todo/index.html`, add the state placeholder before the entry script:

```html
<body>
  <div id="root"><!--app-html--></div>
  <!--app-state-->
  <script type="module" src="/src/entry-client.tsx"></script>
</body>
```

In `examples/vite-todo/server.ts`, the render call is already awaited indirectly — update the typing and template replacement. Replace:

```ts
let render: (url: string) => { html: string; head?: string };
```

with:

```ts
let render: (url: string) => Promise<{ html: string; state: string }>;
```

and replace:

```ts
const rendered = render(url);

const html = template.replace(`<!--app-head-->`, rendered.head ?? "").replace(`<!--app-html-->`, rendered.html ?? "");
```

with:

```ts
const rendered = await render(url);

const html = template
  .replace(`<!--app-html-->`, rendered.html)
  .replace(`<!--app-state-->`, `<script>window.__RXFY_STATE__=${rendered.state}</script>`);
```

(The `<!--app-head-->` replacement can be dropped — nothing produces `head` anymore. Leave the comment in `index.html`; it renders as an HTML comment.)

- [ ] **Step 6: Build and verify manually**

```bash
pnpm --filter rxfy build && pnpm --filter rxfy-react build
pnpm --filter rxfy-example-todo-app check-types
pnpm --filter rxfy-example-todo-app build
```

Expected: all succeed.

Then start the dev server and verify SSR:

```bash
cd examples/vite-todo && pnpm dev &
sleep 3
curl -s http://localhost:5173/ | grep -o "Buy groceries"
curl -s http://localhost:5173/ | grep -o "__RXFY_STATE__"
kill %1
```

Expected: `Buy groceries` appears in the raw HTML (SSR-rendered todo), and the `__RXFY_STATE__` payload is present. In a browser: no loading flash, no fetch on first load (network tab), checkboxes and add-todo work.

- [ ] **Step 7: Run example lint**

Run: `pnpm --filter rxfy-example-todo-app lint`
Expected: clean

- [ ] **Step 8: Commit**

```bash
git add examples/vite-todo/
git commit -m "feat(example)!: migrate vite-todo to normalized state with buffered SSR"
```

---

### Task 19: Changeset + full-repo verification

**Files:**

- Create: `.changeset/ssr-support.md`

- [ ] **Step 1: Write the changeset**

```md
---
"rxfy": minor
"rxfy-react": minor
---

First-class SSR support.

- `useStateData` fetches on demand during SSR via Suspense — no manual prefetch API. Results are captured as fulfilled/rejected query-cache entries.
- New `dehydrate`/`hydrate` serialize the query cache (entity ids) and named model stores (entities) across the server/client boundary; `StoreProvider` accepts `ssr`, `registry`, and `dehydratedState` props and ingests streamed `window.__RXFY_SSR__` chunks.
- New `collectStateData` two-pass helper for strict `renderToString` environments; buffered `renderToPipeableStream` + `onAllReady` is the recommended non-streaming mode.
- New `rxfy-react/next` subpath with `<HydrationStream />` for Next.js App Router streaming.
- `createModel` accepts `name`, `defineState` accepts `key` — stable string identities required for SSR serialization.
- Hydrated state renders fulfilled on first paint (`usePending` sync probe) — no loading flash, no re-fetch, no hydration mismatch.

BREAKING: `data$` now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()` are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual `store.set(...)` + mutation two-step is no longer needed.
```

- [ ] **Step 2: Run the full repo pipeline**

```bash
pnpm build && pnpm test && pnpm lint && pnpm check-types
```

Expected: all green across rxfy, rxfy-react, utils, and the example.

- [ ] **Step 3: Commit**

```bash
git add .changeset/ssr-support.md
git commit -m "chore: add changeset for SSR support release"
```

---

## Out of Scope (follow-up spec)

`examples/next-blog` — Next.js App Router blog exercising `<HydrationStream />` end-to-end (streaming hydration, parallel Suspense fetches, membership mutations, live `store.set()` updates, rejected-state hydration). Until then, `<HydrationStream />` is covered by unit tests only.
