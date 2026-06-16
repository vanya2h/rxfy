---
"rxfy-react": minor
---

Add `useStatePagedData` — a focused hook for paginated / infinite-scroll lists of a single entity type. You give it a `model` (the list is always `array(model)`) and a `key`; `data$` emits a flat `string[]` of ids. Page 0 is SSR'd and hydrated through `useStateData`; `loadMore()` fetches and appends later pages via a pluggable `getCursor` and `select`, with built-in `isLoading` and `hasMore`. Appending is O(page size) — only the new page's entities are written, never the whole list.

Also adds `setRaw` to `StateHandle`: a low-level sibling of `set` that writes the normalized id shape directly (no normalize/denormalize round-trip), for append / prepend / reorder / dedup without re-normalizing the full list.
