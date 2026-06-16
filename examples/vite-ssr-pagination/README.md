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

- **Page 1 is server-rendered.** `useStateData(usersState, fetchFirst, params)` fetches the
  first page during SSR; the component suspends and the list streams in. The entities
  normalize into the `userModel` store; the query holds only ids.
- **Rows are generated on demand.** `getUsersPage(cursor)` (in `shared/generate.ts`) makes a
  page of users with faker, seeded by row index, and always returns the next cursor — the
  list is infinite. The generator is server-only; `import.meta.env.SSR` lets Vite
  dead-code-eliminate it from the client bundle, so faker never ships to the browser. The
  schema in `shared/users.ts` is the only shared module the client imports.
- **Later pages are fetched client-side and appended** with `set((prev) => ({ users: [...prev.users, ...page.items] }))`.
  Each new id appends to the query's list; row data lives in the store, so a user returned
  on two pages resolves to one cell.
- **Offset as cursor, derived from the loaded count.** The next offset is simply the number
  of rows already loaded. This is hydration-safe: under SSR, `useStateData` hydrates page 1
  from the cache and does *not* re-run `fetchFirst` on the client, so a cursor stashed during
  the first fetch would be lost. Deriving the offset from the rendered list length works on
  both server and client. Keep this view state out of `params` — stable params are what let
  `set` accumulate one growing list.

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
