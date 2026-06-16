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
  - **Offset-as-cursor, derived from the loaded count (hydration-safe).** The cursor is
    offset-based, and the offset equals the number of rows already loaded. Rather than
    stashing `nextCursor` in a ref from `fetchFirst`, the component derives the next offset
    from the current id-list length at call time. This matters because under SSR
    `useStateData` hydrates page 1 from the query cache and does **not** re-run `fetchFirst`
    on the client — a ref stashed during `fetchFirst` would stay `null` on the client and
    break "Load more". Deriving offset from the rendered list length is correct on both
    server and client.
  - `loading = useRef(false)` — guards overlapping `loadMore` calls.
  - `const [hasMore, setHasMore] = useState(true)` — drives button disabled/hidden state;
    flipped to `false` when a page returns `nextCursor === null`.
  - `const [isLoading, setIsLoading] = useState(false)` — drives the loading affordance.
  - `fetchFirst` (passed to `useStateData`): `async () => { const page = await fetchUsers(null); return { users: page.items }; }` (signature is a subset of `(params, signal)`, which is allowed).
  - `const { data$, set } = useStateData(usersState, fetchFirst, params);`
  - `loadMore(offset: number)`: bail if `loading.current || !hasMore`; set `loading`/`isLoading`,
    `const page = await fetchUsers(String(offset))`, `setHasMore(page.nextCursor !== null)`,
    then `set((prev) => ({ users: [...prev.users, ...page.items] }))`; clear loading flags in
    `finally`.
  - Render: `<Pending value$={data$} pending={skeleton}>{({ users }) => …}</Pending>` →
    list of `<UserRow id={id} />`, a "Load more" button
    (`onClick={() => loadMore(users.length)}`, disabled when `isLoading || !hasMore`), and a
    `<LoadMoreSentinel onVisible={() => loadMore(users.length)} />` after the list.

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
  before the client bootstrap `<script>`). The client `StoreProvider` (with `ssr`) drains
  `window.__RXFY_SSR__` automatically on mount.
- Mechanism: `entry-server.tsx`'s `render(url, options)` creates the per-request registry,
  calls `renderToPipeableStream(<StoreProvider registry ssr><App/></StoreProvider>, options)`,
  and returns `{ ...stream, getState }` where `getState = () => hydrationScript(dehydrate(registry))`.
  Keeping the `dehydrate`/`hydrationScript` calls inside the vite-loaded entry module avoids a
  duplicate-`rxfy`-instance hazard from importing it in `server.ts`.
- `server.ts` splits the template on `<!--app-html-->` then `<!--app-state-->`. In the
  transform stream's `finish` handler it writes: the markup after the app, then `getState()`,
  then the tail (which contains the client bootstrap script) — so the snapshot script sits
  after `</div id="root">` and before the module script.
- `entry-client.tsx` hydrates with `<StoreProvider ssr><App/></StoreProvider>`.

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

The template scaffolds `server.js` (converted to `server.ts`), an `App.css`/`assets/`
marketing landing page, and `public/icons.svg` — all removed/replaced. `public/favicon.svg`
is kept. The above is the target shape after rewiring.

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
