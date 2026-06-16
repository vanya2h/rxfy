# Vite SSR Pagination Example — Design

**Date:** 2026-06-16
**Status:** Approved (pending spec review)

## Goal

Add a new example app, `examples/vite-ssr-pagination`, that demonstrates rxfy's pagination
pattern (one growing, normalized list loaded page by page) on top of a streaming-SSR Vite
server. It complements the existing examples (`vite-todo`, `vite-realtime-todos`,
`next-blog`, `rr7-blog`) by being the canonical reference for the pagination guide at
`apps/docs/src/pages/guides/pagination.mdx`.

## Scaffold

Created with:

```bash
pnpm create vite-extra vite-ssr-pagination --template ssr-react-streaming-ts
```

Then rewired into the monorepo to match the other examples:

- Package renamed to `rxfy-example-ssr-pagination`, `"private": true`, `"license": "MIT"`.
- Dependencies: `rxfy`, `rxfy-react` as `workspace:*`; `rxjs`, `zod`, `react`, `react-dom`
  as the example's own deps. Dev deps mirror the other examples (`@vanya2h/eslint-config`,
  `typescript`, `vite`, `@vitejs/plugin-react`, `tsx`, `cross-env`, `rimraf`,
  `@types/react`, `@types/react-dom`).
- Adopt repo conventions: `eslint.config.ts` extending `@vanya2h/eslint-config`,
  the same `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` split used by
  `vite-realtime-todos`.
- Scripts follow the existing examples: `dev` (tsx server), `build:client`,
  `build:server`, `preview`, `lint`, `check-types`, `clean`.

The template's own `server.js` (Express dev/prod server with `renderToPipeableStream`
streaming) is kept and lightly extended with the `/api/users` route. If the template ships
a `.js` server, it is converted to TypeScript run via `tsx` for consistency with the other
examples — but only as much as needed; we do not gratuitously rewrite the template.

## Domain & Data

A directory of **users/people**.

- `shared/users.ts`
  - `User` type: `{ id: string; name: string; email: string; initials: string }`
    (initials stand in for an avatar so the example needs no image assets).
  - A deterministic generated dataset of 200 users (stable across server restarts so SSR
    and client agree).
  - `getUsersPage(cursor: string | null, pageSize = 20): { items: User[]; nextCursor: string | null }`
    — pure, offset-based. The cursor encodes the next offset (e.g. the string `"20"`);
    `nextCursor` is `null` once the dataset is exhausted.

- Server route: `GET /api/users?cursor=<cursor>` → `getUsersPage(cursor)` as JSON.

- `src/api.ts` — **isomorphic** fetch helper:
  - On the server (`typeof window === "undefined"`): call `getUsersPage` directly, so SSR
    does not make an HTTP roundtrip to itself.
  - In the browser: `fetch("/api/users?cursor=...")`.
  - Single signature: `fetchUsers(cursor: string | null): Promise<{ items: User[]; nextCursor: string | null }>`.

## rxfy Wiring

- `src/users.ts`
  - `UserModel = createModel(UserSchema, { getKey: (u) => u.id, name: "user" })`.
  - `usersState = defineState({ key: "users", params: z.object({}), model: { users: array(User) } })`
    — no params (single unfiltered list); an empty params object keeps the query identity
    stable so manual `set` accumulates one list.

- Component `src/Users.tsx`:
  - `params` is a stable empty object via `useMemo`.
  - `cursor = useRef<string | null>(null)` — the next-page cursor (view state, kept out of
    `params` per the guide).
  - `loading = useRef(false)` — guards overlapping `loadMore` calls.
  - `fetchFirst` (passed to `useStateData`): `const page = await fetchUsers(null); cursor.current = page.nextCursor; return { users: page.items };`
  - `const { data$, set } = useStateData(usersState, fetchFirst, params);`
  - `loadMore`: bail if `cursor.current === null` or `loading.current`; set `loading`,
    fetch next page, update `cursor.current`, then
    `set((prev) => ({ users: [...prev.users, ...page.items] }))`; clear `loading` in
    `finally`.
  - Render: `<Pending value$={data$} pending={skeleton}>` → list of `<UserRow id={id} />`,
    a "Load more" button (disabled when no `cursor` / while loading), and a
    `<LoadMoreSentinel onVisible={loadMore} />` after the list.

- `src/UserRow.tsx`: subscribes to one entity via `useModelStore(UserModel)` +
  `store.get(id)` (memoized), rendered through `<Pending>`.

- `src/LoadMoreSentinel.tsx`: `IntersectionObserver` that calls `onVisible` when the
  sentinel scrolls into view (from the guide).

## SSR Approach — Streaming shell + end-of-stream snapshot

Chosen over buffered SSR (which the existing Vite examples use) and over building true
per-chunk hydration.

- Keep the template's `onShellReady` streaming: the HTML shell + list skeleton stream
  immediately for a fast TTFB.
- The first page `<Pending>` is a Suspense boundary; on the server `useStateData` suspends
  until page 1 resolves, then that markup streams in.
- After the React stream completes, inject a single
  `hydrationScript(dehydrate(registry))` at the end of the document (after the root markup,
  before `</body>`). The client `StoreProvider` (with `ssr`) drains
  `window.__RXFY_SSR__` automatically on mount.
- `entry-server.tsx` wraps `<App />` in `<StoreProvider registry={createModelRegistry()} ssr>`
  (one registry per request); `entry-client.tsx` hydrates with `<StoreProvider ssr>`.

### Known limitation (documented, not built)

True *per-chunk progressive* hydration — where each Suspense flush also pushes its own
data delta — is not available in a plain Vite server. rxfy's `HydrationStream` relies on
Next's `useServerInsertedHTML` and cannot run here. The README notes this as a potential
future library feature (a Vite/raw-Node streaming adapter). The end-of-stream snapshot is
correct and still streams the markup; only the data injection is batched once at the end.

## Files

```
examples/vite-ssr-pagination/
  package.json
  index.html
  vite.config.ts
  eslint.config.ts
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  README.md
  server.ts                # template Express server + /api/users + end-of-stream snapshot
  shared/users.ts          # dataset + getUsersPage
  src/
    api.ts                 # isomorphic fetchUsers
    users.ts               # UserModel + usersState
    entry-server.tsx       # render() with streaming + dehydrate
    entry-client.tsx       # hydrateRoot + StoreProvider
    App.tsx
    Users.tsx
    UserRow.tsx
    LoadMoreSentinel.tsx
    index.css
    vite-env.d.ts
```

(Exact file set adjusts to whatever the template scaffolds; the above is the target shape.)

## Verification

- `pnpm --filter rxfy-example-ssr-pagination check-types` passes.
- `pnpm --filter rxfy-example-ssr-pagination lint` passes.
- `pnpm --filter rxfy-example-ssr-pagination build` succeeds (client + server).
- Manual: `dev` server renders the first page server-side (visible in view-source /
  no client refetch on first paint), "Load more" appends a page, scrolling to the bottom
  auto-loads via the sentinel, and the button disables at the end of the dataset.

## Out of Scope

- Real database (in-memory only).
- Filtering/search (would require resetting the list on param change — mentioned in the
  guide but not implemented here to keep the example focused).
- Building a Vite streaming hydration adapter for rxfy (noted as future work).
- A changeset (examples are private/unpublished).
