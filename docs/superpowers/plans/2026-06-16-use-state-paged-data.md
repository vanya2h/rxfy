# useStatePagedData Implementation Plan

> **Historical record.** This plan built the original `state`+`initial`+`merge` API. The shipped
> hook was later revised to take a single `model` (always `array(model)`) with a flat `string[]`
> `data$`, a `select(page) => T[]` callback, and an O(page-size) append via a new `StateHandle.setRaw`.
> See the [React Bindings reference](/react#usestatepageddata) for the current API.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `useStatePagedData` hook to `rxfy-react` that wraps `useStateData` and owns pagination / infinite-scroll mechanics (cursor computation, page accumulation, concurrency guard, loading + end-of-list flags, reset-on-reload).

**Architecture:** The hook composes `useStateData`. It synthesizes the `fetchFn` so page 0 routes through the caller's `fetchPage` + `merge(initial, page0)` and still returns a `TShape` — keeping SSR, caching, and hydration unchanged. `loadMore` reads the latest normalized ids off `data$`, computes a cursor via `getCursor`, fetches the next page, and accumulates it through `handle.set(prev => merge(prev, page))`. Caller-supplied callbacks and the `initial` seed are stashed in a ref so the synthesized `fetchFn` stays referentially stable and `useStateData`'s params-identity refetch semantics are preserved.

**Tech Stack:** React 18, RxJS, TypeScript, Vitest 3 (jsdom env), `@testing-library/react`.

**Branch:** `feat/use-state-paged-data` (already created off `develop`).

---

## Spec reference

`docs/superpowers/specs/2026-06-16-use-state-paged-data-design.md`

## File structure

- **Create** `packages/rxfy-react/src/useStatePagedData.ts` — the hook + its config/return types. Single responsibility: pagination orchestration on top of `useStateData`.
- **Create** `packages/rxfy-react/src/useStatePagedData.test.tsx` — Vitest coverage.
- **Modify** `packages/rxfy-react/src/index.tsx` — export the hook and its types.
- **Modify** `examples/vite-ssr-pagination/src/Users.tsx` — adopt the hook, drop the manual `loadMore`/`loading` ref/`isLoading` state.
- **Create** `.changeset/<name>.md` — `minor` bump for `rxfy-react`.

## Notes for the implementer (read before starting)

- `useStateData(state, fetchFn, params)` returns `StateHandle` = `{ data$, set, reload, mutations }`. `data$` emits `QueryShapeOf<TShape>` (entity **ids**, e.g. `{ posts: string[] }`), NOT entities. `set(prev => …)` receives **denormalized** entities. `reload()` deletes the keyed query cache and rebuilds the handle (new handle identity).
- `useStateData` rebuilds its handle when `fetchFn` **or** `params` identity changes. That is why we must keep the synthesized `fetchFn` stable — see the ref pattern below. Callers are NOT required to memoize the callbacks or `initial`; only `params` must be referentially stable (same rule as `useStateData` today).
- `normalizeResult(registry, fields, value)` turns a `TShape` into `QueryShapeOf<TShape>`. Used once to derive the empty id-shape passed to `getCursor` for page 0.
- Imports available from `rxfy`: `normalizeResult`, and the types `FieldsMap`, `QueryShapeOf`, `StateDescriptor`, `MutationDefs`. `StateHandle` is exported from `./useStateData.js`. `useModelRegistry` from `./registry-context.js`.
- Test environment is jsdom (`typeof window !== "undefined"`), so `useStateData` takes its client path. Tests must keep `params` and the `fetchPage` mock referentially stable across renders (define them once, outside the `renderHook` callback) or the handle will rebuild every render and refetch in a loop.

---

### Task 1: Scaffold the hook — page 0 through `fetchPage` + `merge`

**Files:**
- Create: `packages/rxfy-react/src/useStatePagedData.ts`
- Test: `packages/rxfy-react/src/useStatePagedData.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-react/src/useStatePagedData.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { array, createModel, defineState } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStatePagedData } from "./useStatePagedData.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });

type Post = { id: string; title: string };
type PostShape = { posts: Post[] };
type PostPage = { items: Post[]; nextCursor: number };

const pagedState = defineState({
  key: "paged",
  params: z.object({}),
  model: { posts: array(postModel) },
});

// Stable references — config callbacks may be fresh each render (the hook stabilizes them),
// but `params` must be referentially stable or useStateData rebuilds + refetches every render.
const PARAMS = {};
const INITIAL: PostShape = { posts: [] };
const getCursor = ({ ids }: { ids: { posts: string[] }; pageIndex: number }) => ids.posts.length;
const merge = ({ prev, page }: { prev: PostShape; page: PostPage }) => ({ posts: [...prev.posts, ...page.items] });

/** A page of `count` posts starting at numeric id `start`. */
const page = (start: number, count: number): PostPage => ({
  items: Array.from({ length: count }, (_, i) => ({ id: String(start + i), title: `P${start + i}` })),
  nextCursor: start + count,
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStatePagedData", () => {
  it("fetches and normalizes page 0 through fetchPage + merge", async () => {
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 2)));
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["0", "1"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ cursor: 0 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: FAIL — `Failed to resolve import "./useStatePagedData.js"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/rxfy-react/src/useStatePagedData.ts`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldsMap, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import { normalizeResult } from "rxfy";
import { useModelRegistry } from "./registry-context.js";
import { useStateData, type StateHandle } from "./useStateData.js";

export type PagedStateHandle<TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> =
  StateHandle<TShape, TMutations> & {
    /** Fetch and append the next page. No-op while a load is in flight or once `hasMore` is false. */
    readonly loadMore: () => void;
    /** True while a `loadMore` fetch is in flight. */
    readonly isLoading: boolean;
    /** False once `config.hasMore` reports the list is exhausted (always true if `hasMore` is omitted). */
    readonly hasMore: boolean;
  };

export type UseStatePagedDataConfig<TParams, TShape, TPage, TCursor, TMutations extends MutationDefs<TShape>> = {
  state: StateDescriptor<TParams, TShape, TMutations>;
  params: TParams;
  /** Empty seed `merge`d with page 0, e.g. `{ users: [] }`. */
  initial: TShape;
  fetchPage: (args: { cursor: TCursor; params: TParams; signal: AbortSignal }) => Promise<TPage>;
  /** Receives the normalized id shape (what `data$` emits) plus the running page index. */
  getCursor: (args: { ids: QueryShapeOf<TShape>; pageIndex: number }) => TCursor;
  /** Receives denormalized entities (like `set(prev => …)`); returns the next full shape. */
  merge: (args: { prev: TShape; page: TPage }) => TShape;
  /** Omit for an infinite list. */
  hasMore?: (args: { page: TPage }) => boolean;
};

export function useStatePagedData<TParams, TShape, TPage, TCursor, TMutations extends MutationDefs<TShape>>(
  config: UseStatePagedDataConfig<TParams, TShape, TPage, TCursor, TMutations>,
): PagedStateHandle<TShape, TMutations> {
  const { state, params } = config;
  const registry = useModelRegistry();

  // Callbacks + seed are often fresh closures each render. Stash them so the synthesized
  // fetchFirst stays referentially stable and useStateData keeps its params-identity refetch.
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageIndexRef = useRef(1); // page 0 is fetched by useStateData; loadMore starts at 1
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMoreState] = useState(true);

  // Normalized empty seed → QueryShapeOf, for page-0's getCursor. Stable per state/registry.
  const emptyIds = useMemo(
    () => normalizeResult(registry, state.fields as FieldsMap, cfgRef.current.initial) as QueryShapeOf<TShape>,
    [registry, state],
  );

  // Latest normalized ids, read synchronously on the loadMore path. Seeded with the empty shape.
  const idsRef = useRef<QueryShapeOf<TShape>>(emptyIds);

  // Page 0 routes through fetchPage + merge so it returns TShape — SSR/cache/hydration unchanged.
  const fetchFirst = useCallback(
    (p: TParams, signal: AbortSignal) => {
      const { fetchPage, getCursor, merge, hasMore: hasMoreFn, initial } = cfgRef.current;
      const cursor = getCursor({ ids: emptyIds, pageIndex: 0 });
      return fetchPage({ cursor, params: p, signal }).then((page) => {
        hasMoreRef.current = hasMoreFn ? hasMoreFn({ page }) : true;
        return merge({ prev: initial, page });
      });
    },
    [emptyIds],
  );

  const handle = useStateData(state, fetchFirst, params);

  const loadMore = useCallback(() => {
    void handle; // loadMore is wired in a later task
  }, [handle]);

  return useMemo(
    () => ({ ...handle, loadMore, isLoading, hasMore }),
    [handle, loadMore, isLoading, hasMore],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStatePagedData.ts packages/rxfy-react/src/useStatePagedData.test.tsx
git commit -m "feat(rxfy-react): scaffold useStatePagedData with page-0 fetch"
```

---

### Task 2: Implement `loadMore` — append pages, guard concurrency, expose `isLoading`

**Files:**
- Modify: `packages/rxfy-react/src/useStatePagedData.ts`
- Test: `packages/rxfy-react/src/useStatePagedData.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe("useStatePagedData", …)` block in `useStatePagedData.test.tsx`:

```tsx
  it("loadMore appends the next page and advances the cursor", async () => {
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 2)));
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$); // page 0 → ids "0","1"

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["0", "1", "2", "3"]);
    // cursor for page 1 = number of loaded ids (offset-based getCursor)
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 2 }));
  });

  it("ignores a second loadMore while one is in flight", async () => {
    let resolveSecond!: (p: PostPage) => void;
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) =>
      cursor === 0 ? Promise.resolve(page(0, 2)) : new Promise<PostPage>((r) => (resolveSecond = r)),
    );
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);

    act(() => {
      result.current.loadMore();
      result.current.loadMore(); // guarded — the first is still in flight
    });
    expect(fetchPage).toHaveBeenCalledTimes(2); // page 0 + exactly one loadMore

    await act(async () => {
      resolveSecond(page(2, 2));
    });
  });

  it("flips isLoading around a loadMore", async () => {
    let resolveSecond!: (p: PostPage) => void;
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) =>
      cursor === 0 ? Promise.resolve(page(0, 2)) : new Promise<PostPage>((r) => (resolveSecond = r)),
    );
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);

    act(() => result.current.loadMore());
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSecond(page(2, 2));
    });
    expect(result.current.isLoading).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: FAIL — `loadMore appends…` expects `fetchPage` called twice but it is called once (loadMore is a no-op); `isLoading` stays `false`.

- [ ] **Step 3: Implement `loadMore` and the ids subscription**

In `packages/rxfy-react/src/useStatePagedData.ts`, replace the placeholder `loadMore` (the `useCallback` whose body is `void handle;`) with the real implementation, and add a subscription effect that keeps `idsRef` current. The relevant region becomes:

```tsx
  const handle = useStateData(state, fetchFirst, params);

  // Mirror the latest normalized ids so loadMore's getCursor can read them synchronously.
  useEffect(() => {
    const sub = handle.data$.subscribe({
      next: (ids) => {
        idsRef.current = ids as QueryShapeOf<TShape>;
      },
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, [handle.data$]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    const { fetchPage, getCursor, merge, hasMore: hasMoreFn } = cfgRef.current;
    const cursor = getCursor({ ids: idsRef.current, pageIndex: pageIndexRef.current });
    fetchPage({ cursor, params, signal: new AbortController().signal })
      .then((page) => {
        hasMoreRef.current = hasMoreFn ? hasMoreFn({ page }) : true;
        pageIndexRef.current += 1;
        handle.set((prev) => merge({ prev, page }));
        setHasMoreState(hasMoreRef.current);
      })
      .catch(() => {
        // Leave the list as-is and allow a retry; the finally clears the in-flight guard.
      })
      .finally(() => {
        loadingRef.current = false;
        setIsLoading(false);
      });
  }, [handle, params]);
```

(Keep the existing `return useMemo(() => ({ ...handle, loadMore, isLoading, hasMore }), [handle, loadMore, isLoading, hasMore]);`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStatePagedData.ts packages/rxfy-react/src/useStatePagedData.test.tsx
git commit -m "feat(rxfy-react): implement loadMore with concurrency guard and isLoading"
```

---

### Task 3: End-of-list — expose `hasMore` and stop paging

**Files:**
- Modify: `packages/rxfy-react/src/useStatePagedData.ts`
- Test: `packages/rxfy-react/src/useStatePagedData.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe` block in `useStatePagedData.test.tsx`:

```tsx
  it("stops paging once hasMore returns false", async () => {
    const hasMore = ({ page }: { page: PostPage }) => page.items.length === 2;
    // page 0 → 2 items (hasMore true); page 1 → 1 item (hasMore false).
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) =>
      Promise.resolve(cursor === 0 ? page(0, 2) : page(2, 1)),
    );
    const { result } = renderHook(
      () =>
        useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge, hasMore }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    result.current.loadMore(); // guarded by hasMore — no fetch
    expect(fetchPage).toHaveBeenCalledTimes(2); // page 0 + one loadMore only
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: FAIL — `result.current.hasMore` stays `true` after the terminal page, because the render state is never synced from `hasMoreRef`.

> Note: `loadMore` already writes `hasMoreRef` and calls `setHasMoreState` from Task 2, so its guard works. What's missing is syncing the **page-0** result (computed into `hasMoreRef` inside `fetchFirst`) into render state. The fix below mirrors `hasMoreRef` into state on every `data$` emission.

- [ ] **Step 3: Sync `hasMore` from the ids subscription**

In `packages/rxfy-react/src/useStatePagedData.ts`, extend the existing `data$` subscription effect's `next` handler to also mirror `hasMoreRef` into render state (React bails out when the value is unchanged):

```tsx
  useEffect(() => {
    const sub = handle.data$.subscribe({
      next: (ids) => {
        idsRef.current = ids as QueryShapeOf<TShape>;
        setHasMoreState(hasMoreRef.current);
      },
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, [handle.data$]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStatePagedData.ts packages/rxfy-react/src/useStatePagedData.test.tsx
git commit -m "feat(rxfy-react): expose hasMore and stop paging at end of list"
```

---

### Task 4: Reset pagination on reload / params change

**Files:**
- Modify: `packages/rxfy-react/src/useStatePagedData.ts`
- Test: `packages/rxfy-react/src/useStatePagedData.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe` block in `useStatePagedData.test.tsx`:

```tsx
  it("reload refetches page 0 and resets the cursor", async () => {
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 2)));
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2)); // cursor 0, then 2

    act(() => result.current.reload());
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));

    // reload cleared the keyed cache; pageIndex/ids reset → page 0 refetched at cursor 0
    expect(fetchPage).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: 0 }));
    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["0", "1"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: FAIL — the 3rd call's cursor is `4` (stale `idsRef` from the pre-reload list), not `0`, because pagination state is never reset.

> Why this works once fixed: `reload()` bumps `useStateData`'s internal counter, producing a new `handle` identity. A reset effect keyed on `handle` clears the pagination refs; the new `fetchFirst` then refetches page 0 using `emptyIds` (cursor 0).

- [ ] **Step 3: Add the reset effect**

In `packages/rxfy-react/src/useStatePagedData.ts`, add this effect immediately **after** `const handle = useStateData(state, fetchFirst, params);` and **before** the `data$` subscription effect (declaration order matters: reset must run before the re-subscription's first emission):

```tsx
  // A new handle means params changed or reload() ran — start pagination over.
  useEffect(() => {
    loadingRef.current = false;
    hasMoreRef.current = true;
    pageIndexRef.current = 1;
    idsRef.current = emptyIds;
    setIsLoading(false);
    setHasMoreState(true);
  }, [handle, emptyIds]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy-react test useStatePagedData`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full package suite + type check**

Run: `pnpm --filter rxfy-react test && pnpm --filter rxfy-react check-types`
Expected: All tests PASS; `tsc --noEmit` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-react/src/useStatePagedData.ts packages/rxfy-react/src/useStatePagedData.test.tsx
git commit -m "feat(rxfy-react): reset pagination on reload and params change"
```

---

### Task 5: Export the hook

**Files:**
- Modify: `packages/rxfy-react/src/index.tsx`

- [ ] **Step 1: Add the exports**

In `packages/rxfy-react/src/index.tsx`, add these two lines in alphabetical position (immediately after the existing `useStateData` export lines, line 12-13):

```tsx
export type { PagedStateHandle, UseStatePagedDataConfig } from "./useStatePagedData.js";
export { useStatePagedData } from "./useStatePagedData.js";
```

- [ ] **Step 2: Verify the build emits the new export**

Run: `pnpm --filter rxfy-react build && node -e "import('rxfy-react').then(m => { if (typeof m.useStatePagedData !== 'function') throw new Error('missing export'); console.log('export ok'); })"`
Expected: `export ok` printed (build succeeds and the named export resolves).

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-react/src/index.tsx
git commit -m "feat(rxfy-react): export useStatePagedData"
```

---

### Task 6: Adopt the hook in the example

**Files:**
- Modify: `examples/vite-ssr-pagination/src/Users.tsx`

- [ ] **Step 1: Rewrite `Users.tsx` to use the hook**

Replace the entire contents of `examples/vite-ssr-pagination/src/Users.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { Pending, useStatePagedData } from "rxfy-react";
import { fetchUsers } from "./api.ts";
import { LoadMoreSentinel } from "./LoadMoreSentinel.tsx";
import { UserRow } from "./UserRow.tsx";
import { usersState } from "./users.ts";

type Mode = "scroll" | "click";

export function Users() {
  // Stable params → one query identity → loadMore accumulates a single growing list.
  const params = useMemo(() => ({}), []);

  // How the next page loads — pure view state, defaults to "scroll" on both server and client.
  const [mode, setMode] = useState<Mode>("scroll");

  // Page 0 is SSR'd + cached + hydrated through useStateData; loadMore pages are client-only.
  // Offset cursor = number of rows already loaded (`ids.users.length`) — hydration-safe and
  // does not depend on page 0 re-running on the client. The list is infinite (no `hasMore`).
  const { data$, loadMore, isLoading } = useStatePagedData({
    state: usersState,
    params,
    initial: { users: [] },
    fetchPage: ({ cursor }) => fetchUsers(cursor === 0 ? null : String(cursor)),
    getCursor: ({ ids }) => ids.users.length,
    merge: ({ prev, page }) => ({ users: [...prev.users, ...page.items] }),
  });

  return (
    <>
      <div className="mode-toggle" role="group" aria-label="How to load more users">
        <button className={mode === "scroll" ? "active" : ""} onClick={() => setMode("scroll")}>
          Infinite scroll
        </button>
        <button className={mode === "click" ? "active" : ""} onClick={() => setMode("click")}>
          Load on click
        </button>
      </div>

      <Pending value$={data$} pending={<p className="status">Loading users…</p>}>
        {({ users }) => (
          <>
            <ul className="user-list">
              {users.map((id) => (
                <UserRow key={id} id={id} />
              ))}
            </ul>
            {mode === "click" ? (
              <button className="load-more" onClick={() => loadMore()} disabled={isLoading}>
                {isLoading ? "Loading…" : "Load more"}
              </button>
            ) : (
              <>
                {isLoading && <p className="status">Loading…</p>}
                {/* Fresh closure each render keeps re-arming the observer after every load. */}
                <LoadMoreSentinel onVisible={() => loadMore()} />
              </>
            )}
          </>
        )}
      </Pending>
    </>
  );
}
```

- [ ] **Step 2: Type-check the example**

Run: `pnpm --filter vite-ssr-pagination check-types`
Expected: no errors. (If the example has no `check-types` script, run `turbo check-types --filter=vite-ssr-pagination` from the repo root instead.)

- [ ] **Step 3: Commit**

```bash
git add examples/vite-ssr-pagination/src/Users.tsx
git commit -m "refactor(example): use useStatePagedData for vite-ssr-pagination"
```

---

### Task 7: Changeset + full verification

**Files:**
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Create the changeset**

Create `.changeset/use-state-paged-data.md` with this exact content:

```markdown
---
"rxfy-react": minor
---

Add `useStatePagedData` — a reusable hook for paginated / infinite-scroll lists. Wraps `useStateData`: page 0 is SSR'd and hydrated as usual, while `loadMore()` fetches and appends subsequent pages via a pluggable `getCursor` and `merge`, with built-in `isLoading` and `hasMore` flags.
```

- [ ] **Step 2: Run the full monorepo gate**

Run: `turbo build lint check-types test --filter=rxfy-react --filter=vite-ssr-pagination`
Expected: all four tasks succeed for both packages.

- [ ] **Step 3: Commit**

```bash
git add .changeset/use-state-paged-data.md
git commit -m "chore: changeset for useStatePagedData"
```

---

## Self-review checklist (completed during planning)

- **Spec coverage:** signature/generics (Task 1, 5) · single config object + object-param callbacks (Task 1) · page-0 via fetchPage+merge / SSR-safe (Task 1) · loadMore + concurrency guard + isLoading (Task 2) · getCursor reads ids / merge reads entities (Task 1-2) · optional hasMore + termination (Task 3) · reload reset (Task 4) · extended StateHandle return (Task 1) · export (Task 5) · example refactor (Task 6) · changeset (Task 7) · tests for accumulation/concurrency/hasMore/reload/cursor (Tasks 2-4). All covered.
- **Placeholder scan:** the only intentional placeholder is `loadMore`'s `void handle;` body in Task 1, explicitly replaced in Task 2. No "TBD"/"add error handling"/etc.
- **Type consistency:** `PagedStateHandle`, `UseStatePagedDataConfig`, `useStatePagedData`, `fetchPage`/`getCursor`/`merge`/`hasMore` object-param shapes, and ref names (`cfgRef`, `loadingRef`, `hasMoreRef`, `pageIndexRef`, `idsRef`) are identical across all tasks and the export.

## Out of scope (per spec)

- Keyset/opaque-token cursors that need entity fields in `getCursor`.
- Bidirectional paging and windowing/virtualization.
- A built-in intersection-observer sentinel component.
- Surfacing `loadMore` fetch errors beyond clearing the in-flight guard (a future `onError`/error-state option could add this).
