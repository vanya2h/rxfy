# rxfy

rxfy (/ɑɹ ɪks faɪ/) — stream-based state management built on RxJS.

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

The recommended approach — define typed state shapes, normalize entities, and mutate state without manual bookkeeping.

### `defineState`

Defines a typed state shape: fetch params schema, model fields, and optional mutations.

```ts
import { z } from "zod";
import { defineState, array } from "rxfy";

const todosState = defineState({
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(TodoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});
```

**Signature:**

```ts
function defineState<TParams, TFields, TMutations>(def: {
  params: z.ZodType<TParams>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations>
```

### `createModel`

Creates a typed model descriptor for normalizing and sharing entities across state slices.

```ts
import { z } from "zod";
import { createModel } from "rxfy";

const TodoModel = createModel(
  z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
  { getKey: (todo) => todo.id },
);
```

**Signature:**

```ts
function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string },
): ModelDescriptor<T>
```

### `array` / `single`

Field descriptor helpers — declare whether a `defineState` model field holds an array or a single item.

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
// IModelRegistry: { model<T>(descriptor: ModelDescriptor<T>): ModelStore<T> }

function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T>
// ModelStore<T>: { get(key: string): Observable<T>; set(key, val): void; setMany(items): void }
```

---

## Primitive API

Lower-level building blocks. Use these for custom reactive patterns or when the high-level API doesn't fit.

### `Atom` / `createAtom`

A reactive cell — extends `Observable<T>` with synchronous `get()`, `set()`, and `modify()` backed by a `BehaviorSubject`.

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

### `Edge` / `createEdge`

Manages an async data load lifecycle. Queues the load via `p-queue`, tracking `IDLE → PENDING → FULFILLED | REJECTED` state in an `Atom`.

```ts
import PQueue from "p-queue";
import { of } from "rxjs";
import { createAtom, createEdge, createIdle } from "rxfy";

const queue = new PQueue({ concurrency: 5 });
const state$ = createAtom(createIdle<{ id: string }>());
const edge = createEdge(state$, queue, () => of({ id: "42" }));

edge.toObservable().subscribe((user) => console.log(user));
await edge.next(); // trigger a reload
```

**Signature:**

```ts
function createEdge<T>(
  state$: IAtom<IEdgeState<T>>,
  queue: PQueue,
  loader: () => Observable<T>,
): IEdge<T>

// IEdge<T>: {
//   subject$: IAtom<IEdgeState<T>>;
//   toObservable(): Observable<T>;
//   next(): Promise<IWrapped<T, StatusEnum.FULFILLED | StatusEnum.REJECTED>>;
// }
```

### `IWrapped` / `StatusEnum` / helpers

Discriminated union for async state. Used internally by `Edge`; available for custom async primitives.

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

- [rxfy-react](../rxfy-react/README.md) — React bindings
- [examples/vite-todo](../../examples/vite-todo) — full working example
