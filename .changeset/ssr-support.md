---
"rxfy": minor
"rxfy-react": minor
---

First-class SSR support.

- `useStateData` fetches on demand during SSR via Suspense — no manual prefetch API. Results are captured as fulfilled/rejected query-cache entries.
- New `dehydrate`/`hydrate` serialize the query cache (entity ids) and named model stores (entities) across the server/client boundary; `StoreProvider` accepts `ssr`, `registry`, and `dehydratedState` props and ingests streamed `window.__RXFY_SSR__` chunks.
- New `collectStateData` two-pass helper for strict `renderToString` environments; buffered `renderToPipeableStream` + `onAllReady` is the recommended non-streaming mode.
- New `rxfy-react/next` subpath with `<HydrationStream />` for Next.js App Router streaming.
- `createModel` accepts `name`, `defineState` accepts `key` — stable string identities required for SSR serialization.
- Hydrated state renders fulfilled on first paint (`usePending` sync probe) — no loading flash, no re-fetch, no hydration mismatch.
- `useObservable` skips notifications for deep-equal emissions, preventing re-render loops; `usePending` documents that `source$` must be referentially stable.

BREAKING: `data$` now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()` are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual `store.set(...)` + mutation two-step is no longer needed.
