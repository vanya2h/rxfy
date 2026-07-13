# rxfy Primitive Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rxfy data layer compose `Atom`, `Lens`, and `Wrapped`, delete the orphaned `Edge`/`Batcher`, and give query status a real home as `Atom<IWrapped>`.

**Architecture:** Four stacked phases. (1) Delete Edge + Batcher. (2) Convert `ModelStore` entity cells to `Atom`. (3) Make the registry own one `Atom<IWrapped<QueryShape>>` per query key, unify the three status unions on `IWrapped`, and add the `SerializedWrapped` SSR boundary. (4) Add the entity-field handle + `useAtom` for app-wide two-way form binding. Each phase keeps the full suite green.

**Tech Stack:** TypeScript, RxJS, Vitest 3, React 18, tsup, Turbo, pnpm. Prettier: 120 width, double quotes, semicolons, trailing commas.

**Spec:** `docs/superpowers/specs/2026-06-13-rxfy-primitive-unification-design.md`

---

## File Structure

| File                                      | Phase   | Change                                                                           |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `packages/rxfy/src/index.ts`              | 1       | Remove `edge` export                                                             |
| `packages/rxfy/src/edge/`                 | 1       | Delete directory                                                                 |
| `packages/rxfy/src/batcher/`              | 1       | Delete directory                                                                 |
| `packages/rxfy-react/src/index.tsx`       | 1, 3, 4 | Remove `useEdge`/`Edge`; remove `IPendingStatus` re-export; add `useAtom` export |
| `packages/rxfy-react/src/index.test.tsx`  | 1       | Delete (Edge-only test)                                                          |
| `packages/rxfy/src/model/model-store.ts`  | 2, 4    | Atom cells; `entity()` handle                                                    |
| `packages/rxfy/src/ssr/serialize.ts`      | 3       | Add `SerializedWrapped` + `serializeWrapped`/`deserializeWrapped`                |
| `packages/rxfy/src/query/query-cache.ts`  | 3       | Own `Atom<IWrapped>` per key; remove `QueryEntry`                                |
| `packages/rxfy/src/ssr/hydration.ts`      | 3       | `DehydratedState.queries` → `SerializedWrapped`; seed Atoms on hydrate           |
| `packages/rxfy-react/src/useStateData.ts` | 3       | Use `registry.queries.getQuery`; drive status on the Atom                        |
| `packages/rxfy-react/src/usePending.ts`   | 3       | Return `IWrapped<T>`; drop `onReload`                                            |
| `packages/rxfy-react/src/Pending.tsx`     | 3       | Switch on `StatusEnum`                                                           |
| `packages/rxfy-react/src/useAtom.ts`      | 4       | New hook                                                                         |

---

## Phase 1 — Remove Edge and Batcher

### Task 1: Delete Edge and Batcher from core

**Files:**

- Modify: `packages/rxfy/src/index.ts:2`
- Delete: `packages/rxfy/src/edge/edge.ts`
- Delete: `packages/rxfy/src/batcher/index.ts`, `packages/rxfy/src/batcher/index.test.ts`

- [ ] **Step 1: Confirm nothing in core imports Edge or Batcher**

Run:

```bash
cd /Users/ivankoryakovtsev/Work/rxfy
grep -rn --include="*.ts" -E "from \"\.\./edge|from \"\./edge|/edge/edge|batcher" packages/rxfy/src | grep -v "src/edge/" | grep -v "src/batcher/"
```

Expected: no output (only the deleted dirs reference themselves).

- [ ] **Step 2: Remove the edge export from the barrel**

In `packages/rxfy/src/index.ts`, delete this line:

```ts
export * from "./edge/edge.js";
```

(There is no batcher export line — Batcher was never exported.)

- [ ] **Step 3: Delete the directories**

Run:

```bash
rm -rf packages/rxfy/src/edge packages/rxfy/src/batcher
```

- [ ] **Step 4: Verify core builds and type-checks**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy check-types && pnpm --filter rxfy test
```

Expected: all PASS. (`wrapped.ts`, which Edge used, stays — it now serves the query layer.)

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/index.ts packages/rxfy/src/edge packages/rxfy/src/batcher
git commit -m "refactor(rxfy): remove orphaned Edge and Batcher"
```

### Task 2: Remove useEdge / <Edge> from rxfy-react

**Files:**

- Modify: `packages/rxfy-react/src/index.tsx:1-43`
- Delete: `packages/rxfy-react/src/index.test.tsx`

- [ ] **Step 1: Confirm the React Edge has no other consumers**

Run:

```bash
grep -rn --include="*.ts" --include="*.tsx" -E "useEdge|<Edge|renderWithParams|IRenderFn" packages examples | grep -vE "rxfy-react/src/index"
```

Expected: no output.

- [ ] **Step 2: Rewrite `index.tsx` removing the Edge surface**

Replace the top of `packages/rxfy-react/src/index.tsx` (the `import` through the `renderWithParams` helper, lines 1-40) with just the re-export block. The file becomes only re-exports:

```tsx
export type { IBehaviorSubjectRenderProps, IPendingProps } from "./Pending.js";
export { BehaviorSubjectRender, Pending } from "./Pending.js";
export { ModelRegistryContext, useModelRegistry } from "./registry-context.js";
export { collectStateData } from "./ssr/collect-state-data.js";
export type { StoreProviderProps } from "./StoreProvider.js";
export { SsrContext, StoreProvider } from "./StoreProvider.js";
export { useModelStore } from "./useModelStore.js";
export { useObservable } from "./useObservable.js";
export type { IPendingStatus, ObservableLike } from "./usePending.js";
export { usePending } from "./usePending.js";
export type { BoundMutations, StateHandle } from "./useStateData.js";
export { useStateData } from "./useStateData.js";
```

(The `IPendingStatus` re-export stays for now — Phase 3 Task 11 removes it. `useEdge`, `Edge`, `IEdgeProps`, `IRenderFn`, `renderWithParams`, and the `IEdge`/`StatusEnum` import are all gone.)

- [ ] **Step 3: Delete the Edge-only test**

Run:

```bash
rm packages/rxfy-react/src/index.test.tsx
```

- [ ] **Step 4: Verify the React package**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy-react check-types && pnpm --filter rxfy-react test
```

Expected: all PASS. The `usePending` + `Pending` path is the documented replacement for `<Edge>`.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/index.tsx packages/rxfy-react/src/index.test.tsx
git commit -m "refactor(rxfy-react): remove useEdge and <Edge>, replaced by usePending/Pending"
```

---

## Phase 2 — ModelStore entity cells become Atoms

This is an internal refactor. The public `ModelStore<T>` type is unchanged, so existing tests must keep passing.

### Task 3: Convert ModelStore cells to Atom

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts:1-48`
- Test: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Step 1: Add tests pinning the cell contract**

Append to `packages/rxfy/src/model/model-store.test.ts`:

```ts
import { firstValueFrom, toArray } from "rxjs";

describe("createModelStore cell semantics", () => {
  const Post = createModel<{ id: string; title: string }, string>(
    // reuse whatever schema helper the existing tests use; a zod object with id+title
    postSchema,
    { getKey: (p) => p.id, name: "post-cell-test" },
  );

  it("get() emits nothing before the first set, then the value", async () => {
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
```

If the test file lacks `postSchema`, define a minimal one at the top: `const postSchema = z.object({ id: z.string(), title: z.string() });` with `import { z } from "zod";`.

- [ ] **Step 2: Run the new tests — they should pass against the OLD implementation too**

Run:

```bash
pnpm --filter rxfy test -- model-store
```

Expected: PASS (these assert current behavior; they guard the refactor).

- [ ] **Step 3: Refactor `createModelStore` to use Atom cells**

Replace lines 1-48 of `packages/rxfy/src/model/model-store.ts` (imports + `createModelStore`) with:

```ts
import { filter } from "rxjs";
import { Atom, createAtom } from "../atom/atom.js";
import { createQueryCache, type QueryCache } from "../query/query-cache.js";
import { markSync } from "../ssr/sync-marker.js";
import type { EntityKey, ModelDescriptor } from "./model.js";

export type ModelStore<T> = {
  get: (key: EntityKey<T>) => import("rxjs").Observable<T>;
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;
  /** Synchronous read of the latest value — used by denormalization and dehydration. */
  getValue: (key: string) => T | undefined;
  valueEntries: () => [string, T][];
};

// ...IModelRegistry type stays exactly as-is (lines 15-23 unchanged)...

export function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const cells = new Map<string, Atom<T | undefined>>();

  const getCell = (key: string): Atom<T | undefined> => {
    let cell = cells.get(key);
    if (!cell) {
      cell = createAtom<T | undefined>(undefined);
      cells.set(key, cell);
    }
    return cell;
  };

  const set = (key: string, val: T): void => {
    getCell(key).set(val);
  };

  return {
    get: (key) => markSync(getCell(key).pipe(filter((v): v is T => v !== undefined))),
    set,
    setMany: (items) => items.forEach((item) => set(descriptor.getKey(item), item)),
    getValue: (key) => cells.get(key)?.get(),
    valueEntries: () =>
      [...cells.entries()]
        .filter((entry): entry is [string, Atom<T>] => entry[1].get() !== undefined)
        .map(([key, cell]) => [key, cell.get() as T] as [string, T]),
  };
}
```

Keep `createModelRegistry` (lines 50-89) exactly as it is — it is untouched in this phase.

- [ ] **Step 4: Run the full core suite**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy check-types && pnpm --filter rxfy test
```

Expected: all PASS, including the new cell-semantics tests and every existing model-store/normalize/hydration test.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "refactor(rxfy): back ModelStore cells with Atom"
```

---

## Phase 3 — Query state as registry-owned Atom<IWrapped>

### Task 4: Add the SerializedWrapped boundary helpers

**Files:**

- Modify: `packages/rxfy/src/ssr/serialize.ts`
- Test: `packages/rxfy/src/ssr/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/rxfy/src/ssr/serialize.test.ts`:

```ts
import { StatusEnum, createFulfilled, createPending, createRejected } from "../wrapped/wrapped.js";
import { deserializeWrapped, serializeWrapped } from "./serialize.js";

describe("serializeWrapped / deserializeWrapped", () => {
  it("serializes FULFILLED keeping the value", () => {
    expect(serializeWrapped(createFulfilled({ a: 1 }))).toEqual({ type: StatusEnum.FULFILLED, value: { a: 1 } });
  });

  it("serializes REJECTED into a SerializedError", () => {
    const out = serializeWrapped(createRejected(new TypeError("boom")));
    expect(out).toEqual({ type: StatusEnum.REJECTED, error: { name: "TypeError", message: "boom" } });
  });

  it("returns undefined for non-terminal states", () => {
    expect(serializeWrapped(createPending())).toBeUndefined();
  });

  it("round-trips FULFILLED", () => {
    const w = deserializeWrapped(serializeWrapped(createFulfilled(42))!);
    expect(w).toEqual(createFulfilled(42));
  });

  it("rehydrates REJECTED into a live Error", () => {
    const w = deserializeWrapped(serializeWrapped(createRejected(new Error("nope")))!);
    expect(w.type).toBe(StatusEnum.REJECTED);
    expect((w as { error: unknown }).error).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run:

```bash
pnpm --filter rxfy test -- serialize
```

Expected: FAIL — `serializeWrapped`/`deserializeWrapped` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `packages/rxfy/src/ssr/serialize.ts`:

```ts
import { type IWrapped, StatusEnum, createFulfilled, createRejected } from "../wrapped/wrapped.js";

/** Wire form of a settled query — only terminal states cross the server/client boundary. */
export type SerializedWrapped<TValue = unknown> =
  | { type: StatusEnum.FULFILLED; value: TValue }
  | { type: StatusEnum.REJECTED; error: SerializedError };

/** In-memory IWrapped → wire form. Returns undefined for IDLE/PENDING (never serialized). */
export function serializeWrapped<TValue>(wrapped: IWrapped<TValue>): SerializedWrapped<TValue> | undefined {
  if (wrapped.type === StatusEnum.FULFILLED) return { type: StatusEnum.FULFILLED, value: wrapped.value };
  if (wrapped.type === StatusEnum.REJECTED) return { type: StatusEnum.REJECTED, error: serializeError(wrapped.error) };
  return undefined;
}

/** Wire form → in-memory IWrapped carrying a live Error. */
export function deserializeWrapped<TValue>(entry: SerializedWrapped<TValue>): IWrapped<TValue> {
  if (entry.type === StatusEnum.FULFILLED) return createFulfilled(entry.value);
  return createRejected(rehydrateError(entry.error));
}
```

- [ ] **Step 4: Run the test**

Run:

```bash
pnpm --filter rxfy test -- serialize
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/ssr/serialize.ts packages/rxfy/src/ssr/serialize.test.ts
git commit -m "feat(rxfy): add SerializedWrapped boundary helpers"
```

### Task 5: Rewrite query-cache to own Atom<IWrapped> per key

**Files:**

- Modify: `packages/rxfy/src/query/query-cache.ts` (full rewrite)
- Test: `packages/rxfy/src/query/query-cache.test.ts` (rewrite to new API)

- [ ] **Step 1: Write the new tests**

Replace the body of `packages/rxfy/src/query/query-cache.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run:

```bash
pnpm --filter rxfy test -- query-cache
```

Expected: FAIL — `getQuery`/`peek` not defined.

- [ ] **Step 3: Rewrite `query-cache.ts`**

Replace the entire contents of `packages/rxfy/src/query/query-cache.ts` with:

```ts
import { Atom, createAtom } from "../atom/atom.js";
import { type IWrapped, StatusEnum, createIdle } from "../wrapped/wrapped.js";

export type QueryCache = {
  /** Get-or-create the query's status Atom, seeded IDLE. Shared per key → dedup. */
  getQuery: <TValue = unknown>(key: string) => Atom<IWrapped<TValue>>;
  /** Current value without creating a cell — used by serialization and sync reads. */
  peek: <TValue = unknown>(key: string) => IWrapped<TValue> | undefined;
  delete: (key: string) => void;
  /** Terminal-state entries (FULFILLED/REJECTED) for serialization. */
  entries: () => [string, IWrapped][];
  /** In-flight promise slot — SSR Suspense throws and server-side request dedup. Never serialized. */
  getPromise: (key: string) => Promise<unknown> | undefined;
  setPromise: (key: string, promise: Promise<unknown>) => void;
  inflight: () => Promise<unknown>[];
};

export function createQueryCache(): QueryCache {
  const atoms = new Map<string, Atom<IWrapped<unknown>>>();
  const promises = new Map<string, Promise<unknown>>();

  const getQuery = <TValue = unknown>(key: string): Atom<IWrapped<TValue>> => {
    let atom = atoms.get(key);
    if (!atom) {
      atom = createAtom<IWrapped<unknown>>(createIdle());
      atoms.set(key, atom);
    }
    return atom as Atom<IWrapped<TValue>>;
  };

  const isTerminal = (w: IWrapped<unknown>) => w.type === StatusEnum.FULFILLED || w.type === StatusEnum.REJECTED;

  return {
    getQuery,
    peek: <TValue = unknown>(key: string) => atoms.get(key)?.get() as IWrapped<TValue> | undefined,
    delete: (key) => {
      atoms.delete(key);
      promises.delete(key);
    },
    entries: () =>
      [...atoms.entries()].map(([k, a]) => [k, a.get()] as [string, IWrapped]).filter(([, w]) => isTerminal(w)),
    getPromise: (key) => promises.get(key),
    setPromise: (key, promise) => {
      promises.set(key, promise);
      const cleanup = () => {
        if (promises.get(key) === promise) promises.delete(key);
      };
      void promise.then(cleanup, cleanup);
    },
    inflight: () => [...promises.values()],
  };
}
```

- [ ] **Step 4: Run query-cache tests**

Run:

```bash
pnpm --filter rxfy test -- query-cache
```

Expected: PASS.

- [ ] **Step 5: Commit** (core won't fully build yet — `hydration.ts` still references the old API; that is Task 6)

```bash
git add packages/rxfy/src/query/query-cache.ts packages/rxfy/src/query/query-cache.test.ts
git commit -m "feat(rxfy): query cache owns Atom<IWrapped> per key"
```

### Task 6: Update hydration to the SerializedWrapped snapshot

**Files:**

- Modify: `packages/rxfy/src/ssr/hydration.ts`
- Test: `packages/rxfy/src/ssr/hydration.test.ts`

- [ ] **Step 1: Update the hydration tests**

In `packages/rxfy/src/ssr/hydration.test.ts`, any literal of the old shape `{ status: "fulfilled", value }` / `{ status: "rejected", error }` becomes `{ type: StatusEnum.FULFILLED, value }` / `{ type: StatusEnum.REJECTED, error: { name, message } }`. Add an assertion that a hydrated query Atom holds the value:

```ts
import { StatusEnum } from "../wrapped/wrapped.js";

it("hydrate seeds query Atoms with FULFILLED ids", () => {
  const registry = createModelRegistry();
  hydrate(registry, {
    queries: { "posts:{}": { type: StatusEnum.FULFILLED, value: { posts: ["1"] } } },
    models: {},
  });
  expect(registry.queries.peek("posts:{}")).toEqual({ type: StatusEnum.FULFILLED, value: { posts: ["1"] } });
});

it("dehydrate emits only terminal queries in SerializedWrapped form", () => {
  const registry = createModelRegistry();
  registry.queries.getQuery("posts:{}").set({ type: StatusEnum.FULFILLED, value: { posts: ["1"] } });
  registry.queries.getQuery("idle:{}"); // stays IDLE → excluded
  const snap = dehydrate(registry);
  expect(snap.queries).toEqual({ "posts:{}": { type: StatusEnum.FULFILLED, value: { posts: ["1"] } } });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:

```bash
pnpm --filter rxfy test -- hydration
```

Expected: FAIL — `peek`/new shape mismatch and `queries.set` no longer exists.

- [ ] **Step 3: Rewrite the query parts of `hydration.ts`**

In `packages/rxfy/src/ssr/hydration.ts`:

Replace the import on line 2-3:

```ts
import { type SerializedWrapped, serializeForHtml, serializeWrapped, deserializeWrapped } from "./serialize.js";
```

Change `DehydratedState` (lines 5-8):

```ts
export type DehydratedState = {
  queries: Record<string, SerializedWrapped>;
  models: Record<string, Record<string, unknown>>;
};
```

Change the query loop in `dehydrate` (lines 15-18):

```ts
const queries: DehydratedState["queries"] = {};
for (const [key, wrapped] of registry.queries.entries()) {
  const serialized = serializeWrapped(wrapped);
  if (serialized) queries[key] = serialized;
}
```

Change the query loop in `hydrate` (lines 38-40):

```ts
for (const [key, entry] of Object.entries(state.queries)) {
  registry.queries.getQuery(key).set(deserializeWrapped(entry));
}
```

(The `models` loops and `hydrationScript` are unchanged.)

- [ ] **Step 4: Run core build + tests**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy check-types && pnpm --filter rxfy test
```

Expected: all PASS. Core is now internally consistent on `IWrapped`.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/ssr/hydration.ts packages/rxfy/src/ssr/hydration.test.ts
git commit -m "feat(rxfy): SerializedWrapped SSR snapshot, seed query Atoms on hydrate"
```

### Task 7: Rewire useStateData onto the query Atom

**Files:**

- Modify: `packages/rxfy-react/src/useStateData.ts` (full rewrite of the `useMemo` body and imports)
- Test: `packages/rxfy-react/src/useStateData.test.tsx`

- [ ] **Step 1: Add/confirm behavioral tests**

Ensure `packages/rxfy-react/src/useStateData.test.tsx` covers these (add any that are missing — reuse the file's existing render harness and `defineState`/`createModel` fixtures):

```ts
// 1. cache hit renders synchronously (no fetch)
// 2. cache miss fetches, then data$ emits ids
// 3. reload() deletes the cache key and refetches
// 4. a mutation updates entities and data$ re-emits
// 5. a rejected fetch surfaces as an error on data$ (usePending → REJECTED)
```

Concrete miss-then-fetch test:

```ts
it("fetches on miss and emits ids", async () => {
  const registry = createModelRegistry();
  const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
  const { result } = renderHook(() => useStateData(PostsState, fetchFn, {}), { wrapper: wrapperFor(registry) });
  const ids = await firstValueFrom(result.current.data$);
  expect(ids).toEqual({ posts: ["1"] });
  expect(fetchFn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to confirm current state**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy-react test -- useStateData
```

Expected: existing tests PASS against the old implementation (the new ones may already pass; they pin behavior we must preserve).

- [ ] **Step 3: Rewrite `useStateData.ts`**

Replace the imports (lines 1-14) with:

```ts
import { useContext, useMemo, useState } from "react";
import type { FieldsMap, IWrapped, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import {
  Atom,
  attachReload,
  createAtom,
  createFulfilled,
  createIdle,
  createPending,
  createRejected,
  denormalizeValue,
  markSync,
  normalizeResult,
  StatusEnum,
  stableStringify,
} from "rxfy";
import { filter, Observable, of, switchMap, throwError } from "rxjs";
import { useModelRegistry } from "./registry-context.js";
import { SsrContext } from "./StoreProvider.js";
```

Keep `BoundMutations` and `StateHandle` types (lines 16-28) unchanged. Replace the `useMemo` body (lines 39-151) with:

```ts
return useMemo(() => {
  void reloadCounter; // reload() bumps this to rebuild the handle
  const fields = state.fields as FieldsMap;
  const cacheKey = state.key ? `${state.key}:${stableStringify(params)}` : undefined;
  const isServer = typeof window === "undefined";

  // The query's status Atom. Keyed states share one via the registry; keyless states get a private one.
  const atom$: Atom<IWrapped<QueryShapeOf<TShape>>> = cacheKey
    ? registry.queries.getQuery<QueryShapeOf<TShape>>(cacheKey)
    : createAtom<IWrapped<QueryShapeOf<TShape>>>(createIdle());

  const settle = (run: Promise<TShape>) =>
    run.then(
      (result) => atom$.set(createFulfilled(normalizeResult(registry, fields, result))),
      (error: unknown) => atom$.set(createRejected(error)),
    );

  // SSR on-demand fetching: suspend on a cache miss; React re-renders when the promise settles.
  if (isServer && ssr && atom$.get().type === StatusEnum.IDLE) {
    if (!cacheKey) {
      console.warn('rxfy: state without "key" cannot be fetched during SSR — falling back to client fetch');
    } else {
      const inflight = registry.queries.getPromise(cacheKey);
      if (inflight) throw inflight; // dedup: another component already started this fetch
      atom$.set(createPending());
      const promise = settle(fetchFn(params, new AbortController().signal));
      registry.queries.setPromise(cacheKey, promise);
      throw promise;
    }
  }

  const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

  // FULFILLED → value, REJECTED → error(throw), IDLE/PENDING → no emission (usePending shows pending).
  const derived$ = atom$.pipe(
    filter((w) => w.type === StatusEnum.FULFILLED || w.type === StatusEnum.REJECTED),
    switchMap((w) => (w.type === StatusEnum.FULFILLED ? of(w.value) : throwError(() => toError(w.error)))),
  );

  let data$: Observable<QueryShapeOf<TShape>>;
  const settled = atom$.get().type === StatusEnum.FULFILLED || atom$.get().type === StatusEnum.REJECTED;
  if (settled) {
    // cache hit / hydrated: emit synchronously, no fetch (markSync lets usePending probe it at render)
    data$ = markSync(derived$);
  } else {
    // IDLE or shared in-flight PENDING: fetch on subscribe only if still IDLE, else just wait for settle
    data$ = new Observable<QueryShapeOf<TShape>>((subscriber) => {
      const sub = derived$.subscribe(subscriber);
      let controller: AbortController | undefined;
      if (atom$.get().type === StatusEnum.IDLE) {
        atom$.set(createPending());
        controller = new AbortController();
        void settle(fetchFn(params, controller.signal));
      }
      return () => {
        controller?.abort();
        sub.unsubscribe();
      };
    });
  }

  const writeThrough = (ids: QueryShapeOf<TShape>) => atom$.set(createFulfilled(ids));

  const applyUpdate = (updater: (prev: TShape) => TShape) => {
    const current = atom$.get();
    if (current.type !== StatusEnum.FULFILLED) return;
    const prev = denormalizeValue<TShape>(registry, fields, current.value);
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
```

- [ ] **Step 4: Run the React suite**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy-react check-types && pnpm --filter rxfy-react test -- useStateData
```

Expected: all PASS — sync cache hit, miss-fetch, reload, mutations, and rejection all behave as before, now driven by the shared Atom.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/useStateData.test.tsx
git commit -m "feat(rxfy-react): drive useStateData from the registry's query Atom"
```

### Task 8: usePending returns IWrapped; Pending switches on StatusEnum

**Files:**

- Modify: `packages/rxfy-react/src/usePending.ts`
- Modify: `packages/rxfy-react/src/Pending.tsx`
- Modify: `packages/rxfy-react/src/index.tsx` (drop `IPendingStatus` re-export)
- Test: `packages/rxfy-react/src/usePending.test.tsx` (if present) / `Pending` tests

- [ ] **Step 1: Update tests to the IWrapped shape**

In the usePending/Pending tests, replace `status.status === "pending"` with `status.type === StatusEnum.PENDING` (and the `fulfilled`/`rejected` equivalents), importing `StatusEnum` from `rxfy`. Add:

```ts
import { StatusEnum } from "rxfy";

it("returns PENDING then FULFILLED for an async source", async () => {
  const subject = new Subject<number>();
  const { result } = renderHook(() => usePending(subject.asObservable()));
  expect(result.current.type).toBe(StatusEnum.PENDING);
  act(() => subject.next(7));
  expect(result.current).toEqual({ type: StatusEnum.FULFILLED, value: 7 });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:

```bash
pnpm --filter rxfy-react test -- usePending Pending
```

Expected: FAIL — `result.current.type` undefined (still returns `IPendingStatus`).

- [ ] **Step 3: Rewrite `usePending.ts`**

Replace the entire contents of `packages/rxfy-react/src/usePending.ts` with:

```ts
import _ from "lodash";
import { useMemo, useState } from "react";
import { type IWrapped, StatusEnum, createFulfilled, createPending, createRejected, isSyncMarked } from "rxfy";
import { catchError, concat, distinctUntilChanged, isObservable, map, Observable, of } from "rxjs";
import { useObservable } from "./useObservable.js";

export type ObservableLike<T> = Observable<T> | T;

function toObservable<T>(val: ObservableLike<T>): Observable<T> {
  if (isObservable(val)) return val;
  return of(val);
}

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

/**
 * Tracks an observable as an IWrapped status for rendering.
 *
 * Contract: `source$` must be referentially stable across renders (memoize it, e.g. from
 * useStateData or useMemo). A new identity restarts the pipeline from PENDING — intended for
 * genuine source changes (new params / reload), but an observable created inline in render
 * restarts every render and never settles.
 *
 * Reload is no longer part of the status object; trigger it via the StateHandle's reload()
 * or getAttachedReload(source$).
 */
export function usePending<T>(source$: ObservableLike<T>, getDefaultValue?: () => T): IWrapped<T> {
  const [initialProbe] = useState(() => probeSync(source$));

  const target$ = useMemo(() => {
    const emitsSync = isObservable(source$) && isSyncMarked(source$);
    const pendingEmission = getDefaultValue || emitsSync ? [] : [of<IWrapped<T>>(createPending())];
    return concat(
      ...pendingEmission,
      toObservable(source$).pipe(
        map((value): IWrapped<T> => createFulfilled(value)),
        catchError((error) => of<IWrapped<T>>(createRejected(error))),
      ),
    ).pipe(distinctUntilChanged(_.isEqual));
  }, [source$, getDefaultValue]);

  const initialState = useMemo<IWrapped<T>>(() => {
    if (initialProbe?.kind === "value") return createFulfilled(initialProbe.value);
    if (initialProbe?.kind === "error") return createRejected(initialProbe.error);
    if (getDefaultValue) return createFulfilled(getDefaultValue());
    return createPending();
  }, [initialProbe, getDefaultValue]);

  return useObservable(target$, initialState);
}
```

(Reload via the internal `nonce$` is removed: a query reload changes the `data$` identity, which already re-runs this pipeline from PENDING.)

- [ ] **Step 4: Rewrite `Pending.tsx`**

Replace the contents of `packages/rxfy-react/src/Pending.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { type IWrapped, StatusEnum } from "rxfy";
import { BehaviorSubject, distinctUntilChanged, noop, skip, tap } from "rxjs";
import { IRenderable, render } from "./render.js";
import { ObservableLike, usePending } from "./usePending.js";

export type IPendingProps<T> = {
  value$: ObservableLike<T>;
  pending?: IRenderable<void>;
  rejected?: IRenderable<IWrapped<T, StatusEnum.REJECTED>>;
  children: IRenderable<T>;
  getDefaultValue?: () => T;
};

export function Pending<T>({
  value$,
  rejected = () => null,
  pending = null,
  children,
  getDefaultValue,
}: IPendingProps<T>) {
  const status = usePending(value$, getDefaultValue);

  useEffect(() => {
    if (status.type === StatusEnum.REJECTED) {
      console.error(status.error);
    }
  }, [status]);

  switch (status.type) {
    case StatusEnum.PENDING:
      return render(undefined, pending);
    case StatusEnum.REJECTED:
      return render(status, rejected);
    case StatusEnum.FULFILLED:
      return render(status.value, children);
    default:
      return null;
  }
}

export type IBehaviorSubjectRenderProps<T> = {
  value$: BehaviorSubject<T>;
  children: IRenderable<T>;
};

export function BehaviorSubjectRender<T>({ value$, children }: IBehaviorSubjectRenderProps<T>) {
  const [state, setState] = useState<T>(() => value$.getValue());

  useEffect(() => {
    const sub = value$
      .pipe(
        skip(1),
        distinctUntilChanged(),
        tap((x) => setState(x)),
      )
      .subscribe(noop);
    return () => sub.unsubscribe();
  }, [value$]);

  return render(state, children);
}
```

- [ ] **Step 5: Drop the `IPendingStatus` re-export**

In `packages/rxfy-react/src/index.tsx`, change the usePending re-export line to:

```tsx
export type { ObservableLike } from "./usePending.js";
export { usePending } from "./usePending.js";
```

- [ ] **Step 6: Run the React suite**

Run:

```bash
pnpm --filter rxfy-react check-types && pnpm --filter rxfy-react test
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-react/src/usePending.ts packages/rxfy-react/src/Pending.tsx packages/rxfy-react/src/index.tsx
git commit -m "refactor(rxfy-react): unify usePending/Pending on IWrapped, decouple reload"
```

---

## Phase 4 — Entity-field handle and useAtom (two-way form binding)

### Task 9: Add ModelStore.entity(key)

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts`
- Test: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/rxfy/src/model/model-store.test.ts`:

```ts
import { createLens, keyLens } from "../lens/lens.js";

describe("ModelStore.entity", () => {
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
```

- [ ] **Step 2: Run to confirm failure**

Run:

```bash
pnpm --filter rxfy test -- model-store
```

Expected: FAIL — `store.entity` is not a function.

- [ ] **Step 3: Add `entity` to the type and implementation**

In `packages/rxfy/src/model/model-store.ts`:

Add to the `ModelStore<T>` type (after `valueEntries`):

```ts
/** Writable handle over a single entity's cell — for field Lenses and form binding. */
entity: (key: EntityKey<T>) => IAtom<T>;
```

Add the import:

```ts
import { Atom, type IAtom, createAtom } from "../atom/atom.js";
import { createLens } from "../lens/lens.js";
```

Add to the returned object in `createModelStore` (after `valueEntries`):

```ts
    entity: (key) =>
      createLens<T | undefined, T>(getCell(key as string), {
        get: (source) => source as T,
        set: (current) => current,
      }),
```

- [ ] **Step 4: Run core tests**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy check-types && pnpm --filter rxfy test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): ModelStore.entity writable handle for field Lenses"
```

### Task 10: Add the useAtom hook

**Files:**

- Create: `packages/rxfy-react/src/useAtom.ts`
- Modify: `packages/rxfy-react/src/index.tsx`
- Test: `packages/rxfy-react/src/useAtom.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-react/src/useAtom.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { createAtom } from "rxfy";
import { describe, expect, it } from "vitest";
import { useAtom } from "./useAtom.js";

describe("useAtom", () => {
  it("returns the current value and a setter, and re-renders on external change", () => {
    const atom$ = createAtom(1);
    const { result } = renderHook(() => useAtom(atom$));
    expect(result.current[0]).toBe(1);

    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);
    expect(atom$.get()).toBe(2);

    act(() => atom$.set(3));
    expect(result.current[0]).toBe(3);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy-react test -- useAtom
```

Expected: FAIL — `./useAtom.js` does not exist.

- [ ] **Step 3: Implement `useAtom.ts`**

Create `packages/rxfy-react/src/useAtom.ts`:

```ts
import type { IAtom } from "rxfy";
import { useObservable } from "./useObservable.js";

/**
 * Binds an IAtom (entity handle, field Lens, or plain Atom) to React as `[value, set]`.
 * `atom$` must be referentially stable across renders — memoize it (e.g. a Lens via useMemo).
 */
export function useAtom<T>(atom$: IAtom<T>): [T, (value: T) => void] {
  const value = useObservable(atom$, atom$.get());
  return [value, atom$.set];
}
```

- [ ] **Step 4: Export it**

In `packages/rxfy-react/src/index.tsx`, add:

```tsx
export { useAtom } from "./useAtom.js";
```

- [ ] **Step 5: Run the test**

Run:

```bash
pnpm --filter rxfy-react check-types && pnpm --filter rxfy-react test -- useAtom
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-react/src/useAtom.ts packages/rxfy-react/src/index.tsx packages/rxfy-react/src/useAtom.test.tsx
git commit -m "feat(rxfy-react): add useAtom hook for IAtom binding"
```

### Task 11: Integration test — app-wide two-way form sync

**Files:**

- Test: `packages/rxfy-react/src/form-sync.test.tsx` (new)

- [ ] **Step 1: Write the integration test**

Create `packages/rxfy-react/src/form-sync.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createModel, createModelRegistry, createLens, keyLens } from "rxfy";
import { useMemo } from "react";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ModelRegistryContext } from "./registry-context.js";
import { useAtom } from "./useAtom.js";
import { useModelStore } from "./useModelStore.js";

type Post = { id: string; title: string };
const Post = createModel<Post, string>(z.object({ id: z.string(), title: z.string() }), {
  getKey: (p) => p.id,
  name: "post",
});

function TitleInput({ id }: { id: string }) {
  const post$ = useModelStore(Post).entity(id);
  const title$ = useMemo(() => createLens(post$, keyLens<Post, "title">("title")), [post$]);
  const [title, setTitle] = useAtom(title$);
  return <input aria-label="title" value={title} onChange={(e) => setTitle(e.target.value)} />;
}

function TitleLabel({ id }: { id: string }) {
  const [post] = useAtom(useModelStore(Post).entity(id));
  return <span data-testid="label">{post.title}</span>;
}

describe("two-way form sync", () => {
  it("editing an input propagates to an independent subscriber of the same entity", async () => {
    const registry = createModelRegistry();
    registry.model(Post).set("p1", { id: "p1", title: "Hello" });
    const ui = (
      <ModelRegistryContext.Provider value={registry}>
        <TitleInput id="p1" />
        <TitleLabel id="p1" />
      </ModelRegistryContext.Provider>
    );
    render(ui);
    expect(screen.getByTestId("label").textContent).toBe("Hello");

    await act(async () => {
      await userEvent.clear(screen.getByLabelText("title"));
      await userEvent.type(screen.getByLabelText("title"), "World");
    });

    expect(screen.getByTestId("label").textContent).toBe("World");
    expect(registry.model(Post).getValue("p1")).toEqual({ id: "p1", title: "World" });
  });
});
```

If `@testing-library/user-event` is not already a dev dependency of `rxfy-react`, add it: `pnpm --filter rxfy-react add -D @testing-library/user-event`.

- [ ] **Step 2: Run the integration test**

Run:

```bash
pnpm --filter rxfy build && pnpm --filter rxfy-react test -- form-sync
```

Expected: PASS — the label tracks the input through `Lens → cell → independent subscriber`.

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-react/src/form-sync.test.tsx package.json pnpm-lock.yaml
git commit -m "test(rxfy-react): app-wide two-way form sync via entity Lens + useAtom"
```

---

## Final verification

### Task 12: Full monorepo gates

- [ ] **Step 1: Run every gate from the repo root**

Run:

```bash
cd /Users/ivankoryakovtsev/Work/rxfy
turbo build && turbo check-types && turbo lint && turbo test
```

Expected: all PASS across `rxfy`, `rxfy-react`, and examples.

- [ ] **Step 2: Confirm Edge/Batcher and the duplicate unions are gone**

Run:

```bash
grep -rn --include="*.ts" --include="*.tsx" -E "QueryEntry|IPendingStatus|createEdge|useEdge|\"\./edge|batcher" packages | grep -vE "/dist/"
```

Expected: no output.

- [ ] **Step 3: Add a changeset**

Run:

```bash
pnpm changeset
```

Write a minor-bump entry for `rxfy` and `rxfy-react` describing: "Unify the data layer on Atom/Lens/Wrapped; query status is now an Atom<IWrapped>; add ModelStore.entity + useAtom for two-way binding; remove Edge and Batcher." Then commit the generated file.

```bash
git add .changeset
git commit -m "chore: changeset for primitive unification"
```

---

## Self-Review

**Spec coverage:**

- Seam 1 (Wrapped universal type) → Tasks 4, 5, 6, 8. Three unions collapsed: `QueryEntry` (Task 5), `IPendingStatus` (Task 8); core `Wrapped` is the survivor. ✓
- Seam 2 (registry owns `Atom<IWrapped>`, Approach A) → Tasks 5, 7. Keyless fallback (Task 7), promise slot kept for SSR (Tasks 5, 7). ✓
- Seam 3a (Atom cell) → Task 3. ✓
- Seam 3b/3c (entity handle, field Lens, `useAtom`) → Tasks 9, 10, 11. ✓
- Seam 4a (remove Edge/Batcher) → Tasks 1, 2. ✓
- Seam 4b (SerializedWrapped boundary) → Tasks 4, 6. ✓
- `onReload` decoupling → Task 8. ✓
- Testing strategy (query-cache, model-store, lens, useStateData, usePending, useAtom, SSR roundtrip) → Tasks 3, 5, 6, 7, 8, 9, 10, 11. ✓

**Type consistency:** `getQuery`/`peek`/`entries`/`getPromise` are used identically in query-cache.ts (Task 5), hydration.ts (Task 6), and useStateData.ts (Task 7). `serializeWrapped`/`deserializeWrapped`/`SerializedWrapped` defined in Task 4, consumed in Task 6. `ModelStore.entity` defined in Task 9, consumed in Tasks 10-11. `IWrapped` return from `usePending` (Task 8) matches `Pending`'s `StatusEnum` switch (Task 8).

**Phasing:** each phase ends green — Phase 1 (deletions verified by build), Phase 2 (public API unchanged), Phase 3 ends at Task 6 for core consistency then Task 7-8 for React, Phase 4 additive.

**Known boundary note:** Task 5's commit leaves core temporarily inconsistent (hydration.ts still references the old API until Task 6). Tasks 5 and 6 should land together if bisectable green commits are required; otherwise the Task 5 commit is a known intermediate.
