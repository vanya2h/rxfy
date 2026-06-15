# rxfy

rxfy (/ɑɹ ɪks faɪ/) is a small library that lets you declare typed models and the states that query them, then access their data as reactive observables. Normalization keeps your app consistent and reactive at no extra cost. Built on RxJS.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

AI coding agents (Claude Code, Codex, etc.) can load context-aware guidance for this library:

```bash
npx skills add vanya2h/rxfy
```

Two skills are installed: `rxfy` (core API, React hooks, mutations) and `rxfy-ssr` (SSR setup). See [Agent Skills](https://rxfy.vanya2h.me/agent-skills) for details.

---

## Install

```bash
npm install rxfy
# or: pnpm add rxfy  /  yarn add rxfy
```

## Peer dependencies

```json
{
  "rxjs": "^7.0.0",
  "zod": "^3.0.0",
  "lodash": "^4.0.0"
}
```

---

## High-level API

Define typed state shapes, normalize entities, and mutate state without manual bookkeeping.

### `defineState`

Defines a typed state shape: fetch params schema, model fields, and optional mutations.

```ts
import { z } from "zod";
import { defineState, array } from "rxfy";

const todosState = defineState({
  key: "todos", // stable string identity for the SSR query cache
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(TodoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});
```

Mutation reducers operate on the full fetch shape (entities). When invoked through `useStateData`, rxfy denormalizes the current ids into fresh entities, runs the reducer, and normalizes the result back into model stores and ids.

**Signature:**

```ts
function defineState<TParams, TFields, TMutations>(def: {
  key?: string;   // states without a key opt out of SSR caching
  params: z.ZodType<TParams>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations>
```

The normalized query shape (what `data$` emits in `rxfy-react`) is derived as `QueryShapeOf<TShape>`: array fields become `string[]` (entity keys), single fields become `string`.

### `createModel`

Creates a typed model descriptor for normalizing and sharing entities across state slices.

```ts
import { z } from "zod";
import { createModel } from "rxfy";

const TodoModel = createModel(
  z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
  { getKey: (todo) => todo.id, name: "todo" },
);
```

**Signature:**

```ts
function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string; name?: string },
): ModelDescriptor<T>
```

`name` is the model's stable string identity for SSR; symbols can't cross the server/client boundary, so only named models are included in `dehydrate` output. Models without a name work normally but opt out of SSR serialization (a dev warning fires if they hold data at dehydrate time).

### `array` / `single`

Field descriptor helpers that declare whether a `defineState` model field holds an array or a single item.

```ts
import { array, single } from "rxfy";

const userPageState = defineState({
  params: z.object({ userId: z.string() }),
  model: {
    user: single(UserModel),    // one item
    friends: array(UserModel),  // array of items
  },
});
```

**Signatures:**

```ts
function array<T>(model: ModelDescriptor<T>): FieldDescriptor<T[]>
function single<T>(model: ModelDescriptor<T>): FieldDescriptor<T>
```

### `createModelRegistry` / `createModelStore`

Low-level normalized storage. In React apps these are wired automatically by `StoreProvider` from `rxfy-react`; use directly for non-React or custom setups.

```ts
import { z } from "zod";
import { createModel, createModelRegistry } from "rxfy";

const UserModel = createModel(
  z.object({ id: z.string(), name: z.string() }),
  { getKey: (u) => u.id },
);

const registry = createModelRegistry();
const users = registry.model(UserModel);

users.set("1", { id: "1", name: "Alice" });
users.get("1").subscribe(console.log); // emits { id: "1", name: "Alice" }
// Note: get() on a key that has never had set() called returns an Observable that
// never emits until set() or setMany() is called for that key.
```

**Signatures:**

```ts
function createModelRegistry(): IModelRegistry
// IModelRegistry: {
//   model<T>(descriptor: ModelDescriptor<T>): ModelStore<T>;
//   queries: QueryCache;                                      // SSR query cache (fulfilled/rejected entries)
//   namedStores(): ReadonlyMap<string, ModelStore<any>>;
//   stores(): { descriptor; store }[];
//   stashHydration(name: string, entities: Record<string, unknown>): void;
// }

function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T>
// ModelStore<T>: {
//   get(key: string): Observable<T>;         // reactive read; emits on every change
//   set(key, val): void;                      // write one entity
//   setMany(items): void;                     // write many; key derived via getKey
//   getValue(key: string): T | undefined;     // synchronous read of the latest value
//   entity(key: string): IAtom<T>;            // writable handle over one entity's cell
//   valueEntries(): [string, T][];            // snapshot of all loaded [key, value] pairs
//   added$: Observable<string>;               // a key, the first time its entity appears
// }
```

---

## SSR

The registry round-trips across the server/client boundary: queries serialize as normalized ids, named model stores serialize their entities. The React side (`rxfy-react`) drives fetching and ingestion; these are the core primitives it builds on.

### `dehydrate` / `hydrate`

```ts
import { createModelRegistry, dehydrate, hydrate } from "rxfy";

// server: after rendering settles
const state = dehydrate(registry);
// { queries: { "todos:{...}": { status: "fulfilled", value: { todos: ["1"] } } },
//   models:  { todo: { "1": { id: "1", title: "..." } } } }

// client: into a fresh registry before first render
hydrate(clientRegistry, state);
```

**Signatures:**

```ts
function dehydrate(registry: IModelRegistry): DehydratedState
function hydrate(registry: IModelRegistry, state: DehydratedState): void

type DehydratedState = {
  queries: Record<string, QueryEntry>;
  models: Record<string, Record<string, unknown>>;
};
```

### `hydrationScript`

Complete inline `<script>` tag pushing a snapshot onto `window.__RXFY_SSR__`, the queue the client `StoreProvider` drains automatically, so the client side needs no hydration wiring. Inject it into the served HTML before the client entry script.

```ts
import { dehydrate, hydrationScript } from "rxfy";

const html = template.replace("<!--app-state-->", hydrationScript(dehydrate(registry)));
```

**Signature:**

```ts
function hydrationScript(state: DehydratedState): string
// '<script>(window.__RXFY_SSR__=window.__RXFY_SSR__||[]).push({...})</script>'
```

The payload is embedded via `serializeForHtml` (also exported): JSON with `<` and U+2028/U+2029 escaped so it cannot break out of the script tag.

### Internal primitives

`stableStringify`, `normalizeResult`, `denormalizeValue`, `createQueryCache`, `markSync`, `isSyncMarked`, `attachReload`, `getAttachedReload`, `serializeError`, `rehydrateError` are exported because `rxfy-react` consumes them across the package boundary. They are implementation plumbing, not the intended app-facing surface; prefer the APIs above.

---

## Primitive API

Lower-level building blocks. Use these for custom reactive patterns or when the high-level API doesn't fit.

### `Atom` / `createAtom`

A reactive cell that extends `Observable<T>` with synchronous `get()`, `set()`, and `modify()`, backed by a `BehaviorSubject`.

```ts
import { createAtom } from "rxfy";

const count = createAtom(0);

count.get();               // 0
count.set(5);
count.modify((n) => n + 1);
count.get();               // 6

count.subscribe((n) => console.log(n)); // emits current value then future changes
```

**Signature:**

```ts
function createAtom<T>(value: T): Atom<T>
// Atom<T>: Observable<T> & { get(): T; set(val: T): void; modify(fn: (val: T) => T): void }
```

### `Lens` / `createLens` / `keyLens`

A focused, bidirectional view into an `Atom`. Reads and writes propagate in both directions. Uses `lodash.isEqual` for change detection.

```ts
import { createAtom, createLens, keyLens } from "rxfy";

const user = createAtom({ id: "1", name: "Alice" });
const name = createLens(user, keyLens("name"));

name.get();        // "Alice"
name.set("Bob");
user.get();        // { id: "1", name: "Bob" }
```

**Signatures:**

```ts
function createLens<S, T>(source$: IAtom<S>, lens: ILens<S, T>): Lens<S, T>

function keyLens<S, K extends keyof S>(key: K): ILens<S, S[K]>
// ILens<S, T>: { get(source: S): T; set(current: T, source: S): S }
```

### `IWrapped` / `StatusEnum` / helpers

Discriminated union for async state, the `IDLE / PENDING / FULFILLED / REJECTED` pattern used throughout rxfy. It is what the query cache holds per key and what `usePending` returns in `rxfy-react`; also available for custom async primitives.

```ts
import { createIdle, createPending, createFulfilled, createRejected } from "rxfy";

createIdle<string>();     // { type: "IDLE" }
createPending<string>();  // { type: "PENDING" }
createFulfilled("hi");    // { type: "FULFILLED", value: "hi" }
createRejected("oops");   // { type: "REJECTED", error: "oops" }
```

**Signatures:**

```ts
function createIdle<T>(): IWrapped<T, StatusEnum.IDLE>
function createPending<T>(): IWrapped<T, StatusEnum.PENDING>
function createFulfilled<T>(value: T): IWrapped<T, StatusEnum.FULFILLED>
function createRejected<T>(error: unknown): IWrapped<T, StatusEnum.REJECTED>
```

| Helper | Returns |
|---|---|
| `createIdle<T>()` | `{ type: "IDLE" }` |
| `createPending<T>()` | `{ type: "PENDING" }` |
| `createFulfilled<T>(value)` | `{ type: "FULFILLED", value }` |
| `createRejected<T>(error)` | `{ type: "REJECTED", error }` |

---

## See also

- [Documentation website](https://rxfy.vanya2h.me)
- [rxfy-react](../rxfy-react/README.md): React bindings
- [examples/vite-todo](../../examples/vite-todo): full working example
