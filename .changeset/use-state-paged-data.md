---
"rxfy-react": minor
---

Add `useStatePagedData` — a reusable hook for paginated / infinite-scroll lists. Wraps `useStateData`: page 0 is SSR'd and hydrated as usual, while `loadMore()` fetches and appends subsequent pages via a pluggable `getCursor` and `merge`, with built-in `isLoading` and `hasMore` flags.
