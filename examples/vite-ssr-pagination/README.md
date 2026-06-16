# rxfy example — SSR pagination

A streaming-SSR Vite app showing rxfy's paginated, normalized list pattern: a **truly
infinite** users directory loaded one page at a time, with a switch between a **Load more**
button and **infinite scroll**. Rows are generated on demand with `@faker-js/faker` (seeded
per index, so each offset is deterministic), so the list never runs out.

## Run

```bash
pnpm install      # from the repo root
pnpm --filter rxfy-example-ssr-pagination dev
# http://localhost:5176
```

## How it works

- **One hook does it all.** `useStatePagedData({ model: userModel, key: "users", … })` pages a
  list that is always `array(userModel)`. `data$` emits a flat `string[]` of ids; row data lives
  in the `userModel` store.
- **Page 1 is server-rendered.** Internally the hook fetches the first page through `useStateData`
  during SSR; the component suspends and the list streams in.
- **Rows are generated on demand.** `getUsersPage(cursor)` (in `shared/generate.ts`) makes a
  page of users with faker, seeded by row index, and always returns the next cursor — the
  list is infinite. The generator is server-only; `import.meta.env.SSR` lets Vite
  dead-code-eliminate it from the client bundle, so faker never ships to the browser. The
  schema in `shared/users.ts` is the only shared module the client imports.
- **Later pages are appended on the client.** `loadMore()` fetches the next page and appends it
  with O(page-size) work — only the new page's entities are written and their ids concatenated;
  the rows already loaded are never re-normalized. A user returned on two pages resolves to one
  shared cell.
- **Offset as cursor, derived from the loaded count.** `getCursor: ({ ids }) => ids.length` — the
  next offset is simply the number of rows already loaded. This is hydration-safe: under SSR the
  hook hydrates page 1 from the cache and does *not* re-run the first fetch on the client, so a
  cursor stashed during that fetch would be lost; deriving it from the id-list length works on
  both server and client. Stable `params` keep one growing list (a `params` change resets it).

## Streaming SSR wiring

The `ssr-react-streaming-ts` server streams with `renderToPipeableStream` + `onShellReady`.
`render()` (in `src/entry-server.tsx`) owns the per-request `ModelRegistry` and returns a
`getState()` that serializes everything fetched during render. After the React stream
finishes, `server.ts` writes one `hydrationScript(dehydrate(registry))` (at the
`<!--app-state-->` marker, before the client bootstrap script); `StoreProvider` drains it on
mount.

### Known limitation

True *per-chunk progressive* hydration — pushing each Suspense boundary's data as it flushes
— is not available here. rxfy's `HydrationStream` relies on Next's `useServerInsertedHTML`
and can't run in a plain Vite server. The markup still streams; only the data snapshot is
sent once, at the end of the stream. A Vite/raw-Node streaming hydration adapter would be a
nice future addition to `rxfy-react`.
