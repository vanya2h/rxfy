---
"rxfy": minor
---

Replace `QueryCache`'s `getPromise` + `setPromise` pair with a single `getOrStart(key, start)`. The cache now owns the check-and-store atomically — `start` runs only on a cache miss and its promise is registered automatically — so callers can no longer create an in-flight fetch without deduping it.

Also drop the unused `peek` and `delete` methods from `QueryCache`. Read a query's current value via `getQuery(key).get()` instead of `peek(key)`.
