---
"rxfy-react": minor
---

Add `useStatePagedData` — a reusable hook for paginated / infinite-scroll lists. Wraps `useStateData`: page 0 is SSR'd and hydrated as usual, while `loadMore()` fetches and appends subsequent pages via a pluggable `getCursor` and `select`, with built-in `isLoading` and `hasMore` flags. Appending is O(page size) — only the new page's entities are written, never the whole list.

Also adds `setRaw` to `StateHandle`: a low-level sibling of `set` that writes the normalized id shape directly (no normalize/denormalize round-trip), for append / prepend / reorder / dedup without re-normalizing the full list.
