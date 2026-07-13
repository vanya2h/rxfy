# Atoms & Lens

| API                         | What it is                                                                    |
| --------------------------- | ----------------------------------------------------------------------------- |
| `createAtom(value)`         | `BehaviorSubject`-backed `Observable<T>` with `.get()`, `.set()`, `.modify()` |
| `createLens(source$, lens)` | Derived `IAtom` over a slice of an `Atom`; `keyLens(key)` for object fields   |

An `Atom` is a real RxJS `Observable`, so it plugs directly into `useAtom`, `useObservable`, and `<Pending>` (see react-bindings.md).

## Lens for Nested State

```ts
const form$ = createAtom({ name: "", age: 0 });
const name$ = createLens(form$, keyLens("name")); // IAtom<string>
// Writes propagate back to form$; reads are deep-equal deduped
```
