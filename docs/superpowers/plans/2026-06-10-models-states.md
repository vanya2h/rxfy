# Models & States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `createModel` / `defineState` / `useStateData` / `useModelStore` / `StoreProvider` to rxfy, replacing the existing `store.ts` tree with a lean auto-registering model registry.

**Architecture:** Module-level `ModelDescriptor` and `StateDescriptor` are stateless descriptors. At runtime, `StoreProvider` creates an `IModelRegistry` per React tree; `useModelStore(descriptor)` auto-registers and returns a `ModelStore<T>` (a `ReplaySubject`-backed key-value reactive map). `useStateData` fetches data, normalizes it into model stores via `setMany`, and returns a `combineLatest` projection as a cold Observable that `<Pending>` subscribes to.

**Tech Stack:** TypeScript, RxJS 7, Zod 3, React 19, Vitest 3, `@testing-library/react`

---

## File Map

### packages/rxfy

| Action             | Path                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Create             | `src/model/model.ts`                                                                                                 |
| Create             | `src/model/model.test.ts`                                                                                            |
| Create             | `src/model/model-store.ts`                                                                                           |
| Create             | `src/model/model-store.test.ts`                                                                                      |
| Create             | `src/state/state.ts`                                                                                                 |
| Create             | `src/state/state.test.ts`                                                                                            |
| Modify             | `src/index.ts`                                                                                                       |
| Delete             | `src/store/store.ts`                                                                                                 |
| Delete             | `src/store/store.test.ts`                                                                                            |
| Delete (untracked) | `src/store/cache.ts`, `src/store/example.ts`, `src/store/example.test.ts`, `src/store/json.ts`, `src/store/ssss.tsx` |

### packages/rxfy-react

| Action  | Path                            |
| ------- | ------------------------------- |
| Create  | `src/registry-context.ts`       |
| Create  | `src/registry-context.test.tsx` |
| Create  | `src/StoreProvider.tsx`         |
| Create  | `src/StoreProvider.test.tsx`    |
| Create  | `src/useModelStore.ts`          |
| Create  | `src/render.ts`                 |
| Create  | `src/useObservable.ts`          |
| Create  | `src/usePending.ts`             |
| Create  | `src/Pending.tsx`               |
| Create  | `src/Pending.test.tsx`          |
| Create  | `src/useStateData.ts`           |
| Create  | `src/useStateData.test.tsx`     |
| Modify  | `src/index.tsx`                 |
| Rewrite | `src/index.test.tsx`            |
| Modify  | `tsup.config.ts`                |
| Modify  | `package.json`                  |
| Delete  | `src/withData.tsx`              |
| Delete  | `src/ssr.ts`                    |
| Delete  | `src/ssr.test.tsx`              |

---

## Task 1: ModelDescriptor, array, single

**Files:**

- Create: `packages/rxfy/src/model/model.ts`
- Create: `packages/rxfy/src/model/model.test.ts`

- [ ] **Write the failing tests**

```ts
// packages/rxfy/src/model/model.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "./model.js";

const schema = z.object({ id: z.string() });

describe("createModel", () => {
  it("assigns a unique symbol per call", () => {
    const a = createModel(schema, { getKey: (x) => x.id });
    const b = createModel(schema, { getKey: (x) => x.id });
    expect(a._key).not.toBe(b._key);
    expect(typeof a._key).toBe("symbol");
  });

  it("stores schema and getKey", () => {
    const getKey = (x: { id: string }) => x.id;
    const m = createModel(schema, { getKey });
    expect(m.schema).toBe(schema);
    expect(m.getKey({ id: "42" })).toBe("42");
  });
});

describe("array", () => {
  it("produces kind:array descriptor wrapping the model", () => {
    const m = createModel(schema, { getKey: (x) => x.id });
    const f = array(m);
    expect(f.kind).toBe("array");
    expect(f.model).toBe(m);
  });
});

describe("single", () => {
  it("produces kind:single descriptor wrapping the model", () => {
    const m = createModel(schema, { getKey: (x) => x.id });
    const f = single(m);
    expect(f.kind).toBe("single");
    expect(f.model).toBe(m);
  });
});
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter rxfy test
```

Expected: test file not found / import errors.

- [ ] **Implement model.ts**

```ts
// packages/rxfy/src/model/model.ts
import type { z } from "zod";

export type ModelDescriptor<T> = {
  readonly _key: symbol;
  readonly schema: z.ZodType<T>;
  readonly getKey: (item: T) => string;
};

// _shape is a phantom type — never set at runtime, exists only for TypeScript inference
export type FieldDescriptor<TShape> = {
  readonly _shape?: TShape;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any>;
};

export function createModel<T>(schema: z.ZodType<T>, opts: { getKey: (item: T) => string }): ModelDescriptor<T> {
  return { _key: Symbol(), schema, getKey: opts.getKey };
}

export function array<T>(model: ModelDescriptor<T>): FieldDescriptor<T[]> {
  return { kind: "array", model } as FieldDescriptor<T[]>;
}

export function single<T>(model: ModelDescriptor<T>): FieldDescriptor<T> {
  return { kind: "single", model } as FieldDescriptor<T>;
}
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy/src/model/
git commit -m "feat(rxfy): add ModelDescriptor, array, single helpers"
```

---

## Task 2: ModelStore and ModelRegistry

**Files:**

- Create: `packages/rxfy/src/model/model-store.ts`
- Create: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Write the failing tests**

```ts
// packages/rxfy/src/model/model-store.test.ts
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
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter rxfy test
```

Expected: import errors for `model-store.js`.

- [ ] **Implement model-store.ts**

```ts
// packages/rxfy/src/model/model-store.ts
import { Observable, ReplaySubject } from "rxjs";
import type { ModelDescriptor } from "./model.js";

export type ModelStore<T> = {
  get: (key: string) => Observable<T>;
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;
};

export type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
};

export function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const subjects = new Map<string, ReplaySubject<T>>();

  const getSubject = (key: string): ReplaySubject<T> => {
    if (!subjects.has(key)) {
      subjects.set(key, new ReplaySubject<T>(1));
    }
    return subjects.get(key)!;
  };

  return {
    get: (key) => getSubject(key).asObservable(),
    set: (key, val) => getSubject(key).next(val),
    setMany: (items) => items.forEach((item) => getSubject(descriptor.getKey(item)).next(item)),
  };
}

export function createModelRegistry(): IModelRegistry {
  const stores = new Map<symbol, ModelStore<any>>();

  return {
    model: <T>(descriptor: ModelDescriptor<T>): ModelStore<T> => {
      if (!stores.has(descriptor._key)) {
        stores.set(descriptor._key, createModelStore(descriptor));
      }
      return stores.get(descriptor._key) as ModelStore<T>;
    },
  };
}
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): add ModelStore and ModelRegistry"
```

---

## Task 3: StateDescriptor

**Files:**

- Create: `packages/rxfy/src/state/state.ts`
- Create: `packages/rxfy/src/state/state.test.ts`

- [ ] **Write the failing tests**

```ts
// packages/rxfy/src/state/state.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, single } from "../model/model.js";
import { defineState } from "./state.js";

const postModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
const userModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });

describe("defineState", () => {
  it("stores paramsSchema", () => {
    const params = z.object({ page: z.number() });
    const state = defineState({ params, model: { posts: array(postModel) } });
    expect(state.paramsSchema).toBe(params);
  });

  it("stores array field descriptor", () => {
    const state = defineState({
      params: z.object({ page: z.number() }),
      model: { posts: array(postModel) },
    });
    expect(state.fields.posts).toEqual({ kind: "array", model: postModel });
  });

  it("stores single field descriptor", () => {
    const state = defineState({
      params: z.object({ id: z.string() }),
      model: { user: single(userModel) },
    });
    expect(state.fields.user).toEqual({ kind: "single", model: userModel });
  });

  it("supports multiple fields", () => {
    const state = defineState({
      params: z.object({ page: z.number() }),
      model: { posts: array(postModel), user: single(userModel) },
    });
    expect(Object.keys(state.fields)).toEqual(["posts", "user"]);
  });
});
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter rxfy test
```

Expected: import error for `state.js`.

- [ ] **Implement state.ts**

```ts
// packages/rxfy/src/state/state.ts
import type { z } from "zod";
import type { FieldDescriptor } from "../model/model.js";

type FieldsMap = Record<string, FieldDescriptor<any>>;

type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : never;
};

export type StateDescriptor<TParams, TShape> = {
  readonly paramsSchema: z.ZodType<TParams>;
  readonly fields: FieldsMap;
};

export function defineState<TParams, TFields extends FieldsMap>(def: {
  params: z.ZodType<TParams>;
  model: TFields;
}): StateDescriptor<TParams, ShapeFromFields<TFields>> {
  return {
    paramsSchema: def.params,
    fields: def.model,
  };
}
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy/src/state/
git commit -m "feat(rxfy): add StateDescriptor and defineState"
```

---

## Task 4: Update rxfy exports, delete store files

**Files:**

- Modify: `packages/rxfy/src/index.ts`
- Delete: `packages/rxfy/src/store/store.ts`
- Delete: `packages/rxfy/src/store/store.test.ts`
- Delete (untracked): `packages/rxfy/src/store/cache.ts`, `example.ts`, `example.test.ts`, `json.ts`, `ssss.tsx`

- [ ] **Update index.ts**

Replace the full content of `packages/rxfy/src/index.ts` with:

```ts
// packages/rxfy/src/index.ts
export * from "./atom/atom.js";
export * from "./edge/edge.js";
export * from "./lens/lens.js";
export * from "./wrapped/wrapped.js";
export * from "./model/model.js";
export * from "./model/model-store.js";
export * from "./state/state.js";
```

- [ ] **Delete store.ts and store.test.ts (tracked files)**

```bash
git rm packages/rxfy/src/store/store.ts packages/rxfy/src/store/store.test.ts
```

- [ ] **Delete untracked scratch files**

```bash
rm packages/rxfy/src/store/cache.ts \
   packages/rxfy/src/store/example.ts \
   packages/rxfy/src/store/example.test.ts \
   packages/rxfy/src/store/json.ts \
   packages/rxfy/src/store/ssss.tsx
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy test
```

Expected: all model/state/atom/edge/lens/wrapped/batcher tests pass. No store tests.

- [ ] **Verify build**

```bash
pnpm --filter rxfy build
```

Expected: `dist/` produced with no errors.

- [ ] **Commit**

```bash
git add packages/rxfy/src/index.ts
git commit -m "feat(rxfy): expose model/state exports, remove store.ts"
```

---

## Task 5: registry-context

**Files:**

- Create: `packages/rxfy-react/src/registry-context.ts`
- Create: `packages/rxfy-react/src/registry-context.test.tsx`

- [ ] **Write the failing tests**

```tsx
// packages/rxfy-react/src/registry-context.test.tsx
import { renderHook } from "@testing-library/react";
import { createModelRegistry } from "rxfy";
import { describe, expect, it } from "vitest";
import { ModelRegistryContext, useModelRegistry } from "./registry-context.js";

describe("useModelRegistry", () => {
  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useModelRegistry())).toThrow("StoreProvider not found");
  });

  it("returns the registry from context", () => {
    const registry = createModelRegistry();
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => (
        <ModelRegistryContext.Provider value={registry}>{children}</ModelRegistryContext.Provider>
      ),
    });
    expect(result.current).toBe(registry);
  });
});
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter rxfy-react test
```

Expected: import error for `registry-context.js`.

- [ ] **Implement registry-context.ts**

```ts
// packages/rxfy-react/src/registry-context.ts
import { createContext, useContext } from "react";
import type { IModelRegistry } from "rxfy";

export const ModelRegistryContext = createContext<IModelRegistry | null>(null);

export function useModelRegistry(): IModelRegistry {
  const ctx = useContext(ModelRegistryContext);
  if (!ctx) throw new Error("StoreProvider not found");
  return ctx;
}
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy-react test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy-react/src/registry-context.ts packages/rxfy-react/src/registry-context.test.tsx
git commit -m "feat(rxfy-react): add ModelRegistryContext and useModelRegistry"
```

---

## Task 6: StoreProvider and useModelStore

**Files:**

- Create: `packages/rxfy-react/src/StoreProvider.tsx`
- Create: `packages/rxfy-react/src/useModelStore.ts`
- Create: `packages/rxfy-react/src/StoreProvider.test.tsx`

- [ ] **Write the failing tests**

```tsx
// packages/rxfy-react/src/StoreProvider.test.tsx
import { renderHook } from "@testing-library/react";
import { createModel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";

const testModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("StoreProvider", () => {
  it("provides an isolated registry per mount", () => {
    const { result: a } = renderHook(() => useModelStore(testModel), { wrapper });
    const { result: b } = renderHook(() => useModelStore(testModel), { wrapper });
    expect(a.current).not.toBe(b.current);
  });
});

describe("useModelStore", () => {
  it("returns the same store instance on re-render", () => {
    const { result, rerender } = renderHook(() => useModelStore(testModel), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("auto-registers on first call", () => {
    const { result } = renderHook(() => useModelStore(testModel), { wrapper });
    expect(typeof result.current.get).toBe("function");
    expect(typeof result.current.set).toBe("function");
    expect(typeof result.current.setMany).toBe("function");
  });

  it("throws outside StoreProvider", () => {
    expect(() => renderHook(() => useModelStore(testModel))).toThrow("StoreProvider not found");
  });
});
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter rxfy-react test
```

Expected: import errors.

- [ ] **Implement StoreProvider.tsx**

```tsx
// packages/rxfy-react/src/StoreProvider.tsx
import { type PropsWithChildren, useState } from "react";
import { createModelRegistry } from "rxfy";
import { ModelRegistryContext } from "./registry-context.js";

export function StoreProvider({ children }: PropsWithChildren) {
  const [registry] = useState(() => createModelRegistry());
  return <ModelRegistryContext.Provider value={registry}>{children}</ModelRegistryContext.Provider>;
}
```

- [ ] **Implement useModelStore.ts**

```ts
// packages/rxfy-react/src/useModelStore.ts
import type { ModelDescriptor, ModelStore } from "rxfy";
import { useModelRegistry } from "./registry-context.js";

export function useModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const registry = useModelRegistry();
  return registry.model(descriptor);
}
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy-react test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy-react/src/StoreProvider.tsx \
        packages/rxfy-react/src/useModelStore.ts \
        packages/rxfy-react/src/StoreProvider.test.tsx
git commit -m "feat(rxfy-react): add StoreProvider and useModelStore"
```

---

## Task 7: render.ts and useObservable.ts

**Files:**

- Create: `packages/rxfy-react/src/render.ts`
- Create: `packages/rxfy-react/src/useObservable.ts`

These are verbatim copies from the common repo with no external deps — no tests needed beyond later integration.

- [ ] **Create render.ts**

```ts
// packages/rxfy-react/src/render.ts
export type IRenderable<TData> = React.ReactNode | ((data: TData) => React.ReactNode);

export function render<TData>(data: TData, renderable: IRenderable<TData>): React.ReactNode {
  if (typeof renderable === "function") {
    return renderable(data);
  }
  return renderable;
}
```

- [ ] **Create useObservable.ts**

```ts
// packages/rxfy-react/src/useObservable.ts
import { useCallback, useRef, useSyncExternalStore } from "react";
import { Observable } from "rxjs";

export function useObservable<T>(observable: Observable<T>, initialValue: T): T;
export function useObservable<T>(observable: Observable<T>): T | undefined;
export function useObservable<T>(observable: Observable<T>, initialValue?: T): T | undefined {
  const valueRef = useRef<T | undefined>(initialValue);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const sub = observable.subscribe({
        next: (value) => {
          valueRef.current = value;
          onChange();
        },
      });
      return () => sub.unsubscribe();
    },
    [observable],
  );

  return useSyncExternalStore(
    subscribe,
    () => valueRef.current,
    () => initialValue,
  );
}
```

- [ ] **Commit**

```bash
git add packages/rxfy-react/src/render.ts packages/rxfy-react/src/useObservable.ts
git commit -m "feat(rxfy-react): add render helper and useObservable"
```

---

## Task 8: usePending and Pending

**Files:**

- Create: `packages/rxfy-react/src/usePending.ts`
- Create: `packages/rxfy-react/src/Pending.tsx`
- Create: `packages/rxfy-react/src/Pending.test.tsx`
- Modify: `packages/rxfy-react/package.json`

- [ ] **Add lodash as peerDependency in package.json**

In `packages/rxfy-react/package.json`, add `"lodash": "^4.0.0"` to the `peerDependencies` section:

```json
"peerDependencies": {
  "@types/react": "^18.0.0 || ^19.0.0",
  "lodash": "^4.0.0",
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0",
  "rxfy": "workspace:*"
}
```

- [ ] **Create usePending.ts**

```ts
// packages/rxfy-react/src/usePending.ts
import _ from "lodash";
import { useMemo, useState } from "react";
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

export function usePending<T>(source$: ObservableLike<T>, getDefaultValue?: () => T): IPendingStatus<T> {
  const [nonce$] = useState(() => new BehaviorSubject(0));

  const target$ = useMemo(
    () =>
      nonce$.pipe(
        switchMap(() =>
          concat(
            of<IPendingStatus<T>>({ status: "pending" }),
            toObservable(source$).pipe(
              map((value): IPendingStatus<T> => ({ status: "fulfilled", value })),
              catchError((error) =>
                of<IPendingStatus<T>>({
                  status: "rejected",
                  error,
                  onReload: () => nonce$.next(nonce$.getValue() + 1),
                }),
              ),
            ),
          ),
        ),
        distinctUntilChanged(_.isEqual),
      ),
    [source$, nonce$],
  );

  const initialState = useMemo<IPendingStatus<T>>(
    () => (getDefaultValue ? { status: "fulfilled", value: getDefaultValue() } : { status: "pending" }),
    [getDefaultValue],
  );

  return useObservable(target$, initialState);
}
```

- [ ] **Create Pending.tsx**

```tsx
// packages/rxfy-react/src/Pending.tsx
import { useEffect, useState } from "react";
import { BehaviorSubject, distinctUntilChanged, noop, skip, tap } from "rxjs";
import { IRenderable, render } from "./render.js";
import { IPendingStatus, ObservableLike, usePending } from "./usePending.js";

export type IPendingProps<T> = {
  value$: ObservableLike<T>;
  pending?: IRenderable<void>;
  rejected?: IRenderable<IPendingStatus<T, "rejected">>;
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
    if (status.status === "rejected") {
      console.error(status.error);
    }
  }, [status]);

  switch (status.status) {
    case "pending":
      return render(undefined, pending);
    case "rejected":
      return render(status, rejected);
    case "fulfilled":
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

- [ ] **Write smoke test for Pending**

```tsx
// packages/rxfy-react/src/Pending.test.tsx
import { render, screen } from "@testing-library/react";
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import { Pending } from "./Pending.js";

describe("Pending", () => {
  it("shows pending state before observable emits", () => {
    const subject = new Subject<string>();
    render(
      <Pending value$={subject.asObservable()} pending={<div data-testid="loading" />}>
        {(val) => <div data-testid="done">{val}</div>}
      </Pending>,
    );
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("shows fulfilled value after observable emits", async () => {
    const subject = new Subject<string>();
    render(
      <Pending value$={subject.asObservable()} pending={<div data-testid="loading" />}>
        {(val) => <div data-testid="done">{val}</div>}
      </Pending>,
    );
    subject.next("hello");
    expect(await screen.findByTestId("done")).toHaveTextContent("hello");
  });

  it("renders immediately with getDefaultValue", () => {
    const subject = new Subject<string>();
    render(
      <Pending value$={subject.asObservable()} getDefaultValue={() => "default"}>
        {(val) => <div data-testid="done">{val}</div>}
      </Pending>,
    );
    expect(screen.getByTestId("done")).toHaveTextContent("default");
  });
});
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy-react test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy-react/src/usePending.ts \
        packages/rxfy-react/src/Pending.tsx \
        packages/rxfy-react/src/Pending.test.tsx \
        packages/rxfy-react/package.json
git commit -m "feat(rxfy-react): add usePending and Pending component"
```

---

## Task 9: useStateData

**Files:**

- Create: `packages/rxfy-react/src/useStateData.ts`
- Create: `packages/rxfy-react/src/useStateData.test.tsx`

- [ ] **Write the failing tests**

```tsx
// packages/rxfy-react/src/useStateData.test.tsx
import { renderHook } from "@testing-library/react";
import { array, createModel, defineState, single } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";
import { useModelStore } from "./useModelStore.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id });
const userModel = createModel(z.object({ id: z.string(), name: z.string() }), { getKey: (x) => x.id });

const pageState = defineState({
  params: z.object({ page: z.number() }),
  model: { posts: array(postModel) },
});

const singleState = defineState({
  params: z.object({ id: z.string() }),
  model: { user: single(userModel) },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateData", () => {
  it("emits fetched data", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [
        { id: "1", title: "Post 1" },
        { id: "2", title: "Post 2" },
      ],
    });

    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });

    const data = await firstValueFrom(result.current);
    expect(data.posts).toEqual([
      { id: "1", title: "Post 1" },
      { id: "2", title: "Post 2" },
    ]);
    expect(fetchFn).toHaveBeenCalledWith({ page: 0 });
  });

  it("returns new observable instance when params change", () => {
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

  it("returns same observable instance when params reference is stable", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params = { page: 0 };

    const { result, rerender } = renderHook(() => useStateData(pageState, fetchFn, params), { wrapper });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("normalizes array into model store — store observable emits", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [{ id: "42", title: "Stored" }],
    });

    const { result } = renderHook(
      () => ({
        obs$: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );

    await firstValueFrom(result.current.obs$);
    const post = await firstValueFrom(result.current.postStore.get("42"));
    expect(post).toEqual({ id: "42", title: "Stored" });
  });

  it("reactive: model store update re-emits from state observable", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [{ id: "1", title: "v1" }],
    });

    const { result } = renderHook(
      () => ({
        obs$: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );

    const emissions: Array<{ posts: Array<{ id: string; title: string }> }> = [];
    const sub = result.current.obs$.subscribe((v) => emissions.push(v));

    await new Promise((res) => setTimeout(res, 10));
    result.current.postStore.set("1", { id: "1", title: "v2" });
    await new Promise((res) => setTimeout(res, 0));
    sub.unsubscribe();

    expect(emissions.length).toBeGreaterThanOrEqual(2);
    expect(emissions[emissions.length - 1].posts[0].title).toBe("v2");
  });

  it("handles empty array field", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });

    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });

    const data = await firstValueFrom(result.current);
    expect(data.posts).toEqual([]);
  });

  it("handles single field descriptor", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      user: { id: "u1", name: "Alice" },
    });

    const { result } = renderHook(() => useStateData(singleState, fetchFn, { id: "u1" }), { wrapper });

    const data = await firstValueFrom(result.current);
    expect(data.user).toEqual({ id: "u1", name: "Alice" });
  });

  it("propagates fetch rejection as observable error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });

    await expect(firstValueFrom(result.current)).rejects.toThrow("Network error");
  });
});
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter rxfy-react test
```

Expected: import error for `useStateData.js`.

- [ ] **Implement useStateData.ts**

```ts
// packages/rxfy-react/src/useStateData.ts
import { useMemo } from "react";
import { combineLatest, map, Observable, of, Subscription } from "rxjs";
import type { StateDescriptor } from "rxfy";
import { useModelRegistry } from "./registry-context.js";

export function useStateData<TParams, TShape>(
  state: StateDescriptor<TParams, TShape>,
  fetchFn: (params: TParams) => Promise<TShape>,
  params: TParams,
): Observable<TShape> {
  const registry = useModelRegistry();

  return useMemo(
    () =>
      new Observable<TShape>((subscriber) => {
        let innerSub: Subscription | undefined;

        fetchFn(params)
          .then((result) => {
            if (subscriber.closed) return;

            const entries = Object.entries(state.fields);

            // Normalize all fields into their model stores
            for (const [fieldName, fieldDesc] of entries) {
              const modelStore = registry.model(fieldDesc.model);
              const value = (result as Record<string, unknown>)[fieldName];
              if (fieldDesc.kind === "array") {
                modelStore.setMany(value as unknown[]);
              } else {
                modelStore.set(fieldDesc.model.getKey(value), value);
              }
            }

            // Build reactive projection from model stores
            const fieldObservables = entries.map(([fieldName, fieldDesc]) => {
              const modelStore = registry.model(fieldDesc.model);
              const value = (result as Record<string, unknown>)[fieldName];
              if (fieldDesc.kind === "array") {
                const items = value as unknown[];
                if (items.length === 0) return of([]);
                const keys = items.map((item) => fieldDesc.model.getKey(item));
                return combineLatest(keys.map((k) => modelStore.get(k)));
              } else {
                return modelStore.get(fieldDesc.model.getKey(value));
              }
            });

            const fieldNames = entries.map(([name]) => name);

            const projection$ =
              fieldObservables.length === 0
                ? of({} as TShape)
                : combineLatest(fieldObservables).pipe(
                    map((values) => {
                      const shaped: Record<string, unknown> = {};
                      fieldNames.forEach((name, i) => {
                        shaped[name] = values[i];
                      });
                      return shaped as TShape;
                    }),
                  );

            innerSub = projection$.subscribe(subscriber);
          })
          .catch((err) => {
            if (!subscriber.closed) subscriber.error(err);
          });

        return () => innerSub?.unsubscribe();
      }),
    // params is intentionally compared by reference — callers should stabilize with useState/useMemo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, fetchFn, params, registry],
  );
}
```

- [ ] **Run tests — expect pass**

```bash
pnpm --filter rxfy-react test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/useStateData.test.tsx
git commit -m "feat(rxfy-react): add useStateData hook"
```

---

## Task 10: Cleanup and wire index.tsx

**Files:**

- Delete: `packages/rxfy-react/src/withData.tsx`
- Delete: `packages/rxfy-react/src/ssr.ts`
- Delete: `packages/rxfy-react/src/ssr.test.tsx`
- Rewrite: `packages/rxfy-react/src/index.test.tsx`
- Modify: `packages/rxfy-react/src/index.tsx`
- Modify: `packages/rxfy-react/tsup.config.ts`
- Modify: `packages/rxfy-react/package.json`

- [ ] **Delete removed files**

```bash
git rm packages/rxfy-react/src/withData.tsx \
        packages/rxfy-react/src/ssr.ts \
        packages/rxfy-react/src/ssr.test.tsx
```

- [ ] **Rewrite index.test.tsx** (removes store.ts dependencies, uses createEdge directly)

```tsx
// packages/rxfy-react/src/index.test.tsx
import { render, screen } from "@testing-library/react";
import PQueue from "p-queue";
import React, { act } from "react";
import { createAtom, createEdge, createIdle, IEdgeState } from "rxfy";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { Edge } from "./index.js";

describe("Edge", () => {
  it("renders pending then fulfilled once edge resolves", async () => {
    const queue = new PQueue({ concurrency: 1, autoStart: false });
    const state$ = createAtom<IEdgeState<{ id: string }>>(createIdle());
    const edge = createEdge(state$, queue, () => of({ id: "test" }));

    render(
      <Edge edge={edge} pending={<div data-testid="pending" />} rejected={() => <div data-testid="rejected" />}>
        {(x) => <div data-testid="fulfilled">{x.id}</div>}
      </Edge>,
    );

    expect(screen.getByTestId("pending")).toBeInTheDocument();
    await act(() => queue.start().onIdle());
    expect(screen.getByTestId("fulfilled")).toHaveTextContent("test");
  });
});
```

- [ ] **Update index.tsx** to add new exports while keeping useEdge/Edge

```tsx
// packages/rxfy-react/src/index.tsx
import { useEffect, useState } from "react";
import { IEdge, StatusEnum } from "rxfy";

export function useEdge<TData>(edge: IEdge<TData>) {
  const [state, setState] = useState(edge.subject$.get());

  useEffect(() => {
    const sub = edge.subject$.subscribe((x) => setState(x));
    return () => sub.unsubscribe();
  }, [edge]);

  return state;
}

type IEdgeProps<TData> = {
  edge: IEdge<TData>;
  children: IRenderFn<TData>;
  rejected?: IRenderFn<unknown>;
  pending?: React.ReactNode;
};

export function Edge<TData>({ edge, children, rejected = null, pending = null }: IEdgeProps<TData>) {
  const state = useEdge(edge);

  switch (state.type) {
    case StatusEnum.REJECTED:
      return renderWithParams(rejected, state.error);
    case StatusEnum.FULFILLED:
      return renderWithParams(children, state.value);
    default:
      return pending;
  }
}

export type IRenderFn<TData> = React.ReactNode | ((data: TData) => React.ReactNode);

function renderWithParams<TData>(fn: IRenderFn<TData>, data: TData): React.ReactNode {
  if (typeof fn === "function") return fn(data);
  return fn;
}

export { StoreProvider } from "./StoreProvider.js";
export { useModelStore } from "./useModelStore.js";
export { useStateData } from "./useStateData.js";
export { Pending, BehaviorSubjectRender } from "./Pending.js";
export type { IPendingProps, IBehaviorSubjectRenderProps } from "./Pending.js";
export { usePending } from "./usePending.js";
export type { IPendingStatus, ObservableLike } from "./usePending.js";
export { useObservable } from "./useObservable.js";
export { ModelRegistryContext, useModelRegistry } from "./registry-context.js";
```

- [ ] **Update tsup.config.ts** — remove ssr entry

```ts
// packages/rxfy-react/tsup.config.ts
import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig({
  format: ["cjs", "esm"],
  dts: true,
  outDir: config.distDir,
  entry: {
    index: path.join(config.srcDir, "index.tsx"),
  },
});
```

- [ ] **Update package.json** — remove `"./ssr"` export entry

In `packages/rxfy-react/package.json`, replace the `exports` field with:

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "default": "./dist/index.cjs"
  }
}
```

- [ ] **Run all tests**

```bash
pnpm --filter rxfy-react test
```

Expected: all tests pass, no references to withData/ssr/store.

- [ ] **Verify build**

```bash
pnpm --filter rxfy-react build
```

Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` produced with no errors.

- [ ] **Commit**

```bash
git add packages/rxfy-react/src/index.tsx \
        packages/rxfy-react/src/index.test.tsx \
        packages/rxfy-react/tsup.config.ts \
        packages/rxfy-react/package.json
git commit -m "feat(rxfy-react): wire exports, remove withData/ssr, fix index test"
```

---

## Task 11: Full build + type check

- [ ] **Run full test suite**

```bash
turbo test
```

Expected: all packages pass.

- [ ] **Run type check**

```bash
turbo check-types
```

Expected: no type errors.

- [ ] **Run build**

```bash
turbo build
```

Expected: all packages build successfully.

- [ ] **Commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: address type errors from full build"
```
