# rxfy example — SSR pagination

A server-rendered Vite app showing rxfy's paginated, normalized list pattern: a **truly
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
  during SSR; the component suspends inside the app's `<Suspense>` boundary and the server pipes
  once everything has settled (`onAllReady`), so the sent HTML is fully resolved — the list
  renders even with JavaScript disabled.
- **Endpoints are the single data source.** The hono API (`server/api.ts`) validates its inputs
  with zod (`?cursor=abc` is a 400, not a `faker.seed(NaN)`) and serves both environments through
  one typed RPC client (`src/api-client.tsx`): the browser hits `/api` over HTTP; during SSR the
  server injects its in-process `api.request` into `render()`, so there is no second read path to
  drift. The client module never imports server code, so faker stays out of the browser bundle by
  construction.
- **Rows are generated on demand.** `getUsersPage(cursor)` (in `shared/generate.ts`) makes a
  page of users with faker, seeded by row index, and always returns the next cursor — the
  list is infinite. The schema in `shared/users.ts` is the only shared module the client imports.
- **Later pages are appended on the client.** `loadMore()` fetches the next page and appends it
  with O(page-size) work — only the new page's entities are written and their ids concatenated;
  the rows already loaded are never re-normalized. A user returned on two pages resolves to one
  shared cell.
- **Offset as cursor, derived from the loaded count.** `getCursor: ({ ids }) => ids.length` — the
  next offset is simply the number of rows already loaded. This is hydration-safe: under SSR the
  hook hydrates page 1 from the cache and does _not_ re-run the first fetch on the client, so a
  cursor stashed during that fetch would be lost; deriving it from the id-list length works on
  both server and client. Stable `params` keep one growing list (a `params` change resets it).

## SSR wiring

`server.ts` is a hono app (API routes + catch-all SSR) rendering with
`renderToPipeableStream` + `onAllReady`. `render()` (in `src/entry-server.tsx`) receives the
in-process `api.request`, owns the per-request `ModelRegistry`, and returns a `getState()` that
serializes everything fetched during render. After the React stream finishes, `server.ts` writes
one `hydrationScript(dehydrate(registry))` (at the `<!--app-state-->` marker, before the client
bootstrap script); `StoreProvider` drains it on mount.

### Why `onAllReady`, not `onShellReady`

Piping at `onShellReady` streams the shell progressively, but everything inside a suspended
`<Suspense>` boundary then arrives as hidden late chunks revealed by inline `$RC` scripts — with
JavaScript disabled (or for non-executing crawlers) the fallback is all that ever shows. Piping
at `onAllReady` makes React emit the resolved markup in place: no reveal scripts, content-complete
HTML. If you want progressive streaming for browsers, the standard hybrid is `onShellReady` for
regular user agents and `onAllReady` for bots. (Per-chunk _data_ hydration — rxfy's
`HydrationStream` — relies on Next's `useServerInsertedHTML` and can't run in a plain Vite server
either way; the snapshot here is sent once, at the end.)
