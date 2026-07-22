---
"rxfy": minor
"rxfy-react": minor
---

Add model relations with per-state joins. Declare relation fields in a model schema with `ref()`/`refArray()` and join them per fetch with `single(Model).with({ rel: true })` / `join(Model, {...})`, so list and detail payloads share one normalized store. New `useModelStoreValue(model, id)` gives a non-throwing reactive read for components that may render whether or not a relation was joined.

**⚠️ Breaking (type-only): `ModelStore.get` now requires a `StoreKey<T>`, not a bare string.** Query shapes mint `StoreKey`s automatically, so ids read from a state's `data$` keep working unchanged. But a **raw string passed directly to `get()` no longer type-checks** — migrate it with the new `asKey` helper:

```ts
// before
store.get(id);
// after — brand a genuinely-raw id (e.g. a URL param) into the keyspace
store.get(asKey(Model, id));
```

This is a compile-time change only; runtime behavior is identical. It ships as a minor because on-pattern code (ids sourced from query shapes) is unaffected — only off-pattern raw-string `get()` calls need the one-line `asKey` migration.
