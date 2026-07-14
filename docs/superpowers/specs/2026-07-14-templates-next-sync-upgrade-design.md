# templates/next — upgrade to a full sync template — design

**Date:** 2026-07-14
**Status:** Approved design, pre-implementation
**Sub-project:** 1 of 2 (this must land before the e2e suite — Spec 2 —
`2026-07-14-examples-sync-e2e-design.md`).
**Goal:** Bring `templates/next` to **feature parity with `templates/vite`** — a live real-time
todos app with the full rxfy sync engine — so the Next App Router starter demonstrates the same
sync story as the Vite starter, and both can be covered by one shared `sync-todos` e2e spec.

## Why

`templates/vite` is a complete **sync-todos** template: create + toggle persist through a hono API
wired to `createSync`, propagate live to every open tab (updates badge for new todos, entity patch
for toggles), backed by PGlite/drizzle. `templates/next` today is **store-hydrate only**: RSC
prefetch + `<HydrateSnapshot>` seed the store, writes go through a **server action** into an
**in-memory store**, and the toggle is **client-only/optimistic** — no WebSocket, no cross-client
propagation. The two starters therefore tell different stories. This upgrade closes that gap by
porting the Vite template's todos domain onto the Next+WebSocket server architecture already proven
in `examples/next-blog`.

## Reference implementations

- **`templates/vite`** — the sync-todos domain to port: `server/{sync,ws,api,db}.ts`,
  `src/{resources,todos,api-client}.ts`, `src/db/schema.ts`, `TodosPage.tsx` (`.updates-badge`,
  create + toggle). PGlite/drizzle storage, `sync.serve` + `$grant`, `touch` on create,
  `sync.update` on toggle.
- **`examples/next-blog`** — the Next-with-sync architecture to adopt: a **custom `server.mts`**
  hosting Next **and** a `WebSocketServer` on `/live` (`next start`/`next dev` cannot host a WS);
  `src/server/sync.ts` (single `hub`, `SECRET`, `createSync`); `src/server/app.ts` (hono `/api`,
  `serve()` + writes + `touch` + `/live/renew`); `src/blog/api-server.ts` (in-process hc for RSC
  reads); `src/blog/api-client.ts` (browser hc for writes); `src/blog/sync-client.ts` (browser
  registry + `createWsClient` + `createSyncClient({ renewUrl })`); `providers.tsx`
  (`StoreProvider registry/syncClient` + `<HydrationStream />`).

The upgrade = **next-blog's server/transport wiring** + **vite template's todos domain**.

## Target architecture (after upgrade)

```
templates/next/
  server.mts                      # NEW custom server: Next + WebSocketServer on /live (next-blog pattern)
  src/
    server/
      sync.ts                     # NEW hub, SECRET, createSync({ storage: drizzleStorage(db) }), touchState
      app.ts                      # NEW hono /api: GET /todos (serve+$grant), POST /todos (create+touch),
                                  #     PATCH /todos/:id (sync.update), POST /live/renew
      db.ts                       # NEW PGlite + drizzle, initDb() with DDL + seed (from vite template)
    db/schema.ts                  # NEW todos pgTable (from vite template)
    resources.ts                  # NEW todoResource + resource registry
    todos.ts                      # todoModel + todosState + input schemas (from vite template; replaces lib/todos.ts)
    blog/                         # (or keep flat) browser + server clients:
      api-server.ts               # NEW in-process hc<AppType> for RSC reads (defaultData carries $grant)
      api-client.ts               # NEW browser hc<AppType> for writes
      sync-client.ts              # NEW browser registry + ws transport + syncClient(renewUrl:/api/live/renew)
    providers.tsx                 # CHANGED: StoreProvider registry/syncClient from sync-client + <HydrationStream/>
    components/TodosView.tsx      # CHANGED: useStateData → data$/updatesAvailable$/applyUpdates;
                                  #     .updates-badge; toggle calls PATCH (live entity patch), not local set
    app/
      page.tsx                    # CHANGED: RSC fetch via api-server, pass defaultData (with $grant)
      layout.tsx                  # mostly unchanged (wraps providers)
```

**Removed:** `src/lib/{actions,store,todos,ssr}.ts` server-action + in-memory-store path,
`src/app/api/todos/route.ts` (replaced by the hono `/api` app mounted from the custom server),
`src/components/HydrateSnapshot.tsx` if `<HydrationStream />` + `StoreProvider ssr` fully replaces
it (verify during implementation — next-blog uses HydrationStream and has no HydrateSnapshot).

### Server (the one Next-specific complexity)

`next start` cannot host a WebSocket, so — exactly as `examples/next-blog/server.mts` — a custom
`server.mts` calls `next({ dev })`, prepares the app, and creates an `http.Server` whose `upgrade`
handler routes `/live` to `createWsServer(hub, { secret: SECRET })` via a `ws` `WebSocketServer`,
and everything else (including Next's dev HMR socket) to Next's own upgrade handler. `package.json`
`dev`/`start` scripts switch to `tsx server.mts` (dev) / `cross-env NODE_ENV=production tsx
server.mts` (start), mirroring the blog examples. The hono `/api` app is mounted inside this server
so browser writes and `/live/renew` hit it over real HTTP; RSC reads still go in-process via
`api-server.ts` (`hc(..., { fetch: app.request })`).

### Data + writes

- **Storage:** PGlite + drizzle (`server/db.ts`, `src/db/schema.ts`) copied from the vite template,
  including its seed rows (already worded for the two-tab demo: "Toggle me — the other tab updates
  instantly", "Add a todo — the other tab shows a refresh badge").
- **Create:** `POST /api/todos` → `sync.create(todoResource, {...}, { touch: [touch(todosState,
{})] })` — bumps the `todos` channel so other tabs show the updates badge.
- **Toggle:** `PATCH /api/todos/:id` → `sync.update(todoResource, id, { done })` — broadcasts an
  entity patch on `todo:<id>`, landing live in other tabs' stores (this is the behavior the current
  optimistic-only toggle lacks).

### Client

`TodosView` switches from `mutations.addTodo`/local `store.set` to the vite template's model:
`const { data$, updatesAvailable$, applyUpdates } = useStateData(...)`, a `.updates-badge` button
("`{n} new — refresh`"), create via `api.todos.$post(...).then(applyUpdates)`, toggle via
`api.todos[":id"].$patch(...)`. `providers.tsx` passes `sync?.registry` / `sync?.syncClient` to
`StoreProvider` and renders `<HydrationStream />`, identical to next-blog.

## Selector parity with templates/vite (for the shared e2e spec)

To let **one** `sync-todos` spec run against both todos templates, `templates/next`'s todos UI must
expose the same stable selectors as `templates/vite`:

- add input: `input[placeholder="What needs doing?"]`
- submit: an "Add" button
- updates badge: `button.updates-badge` reading `"{n} new — refresh"`
- items: `<li>` per todo with a checkbox

If exact class/text parity proves awkward across frameworks, add matching `data-testid`s to **both**
templates' todos UI (small, local change) rather than forking the spec. Decide during implementation.

## Dependencies / package.json

Add to `templates/next`: `rxfy-client`, `rxfy-ws`, `rxfy-server`, `rxfy-server-drizzle`,
`drizzle-orm`, `@electric-sql/pglite`, `hono`, `@hono/zod-validator`, `ws`, `tsx`, `cross-env`
(match the versions used by `templates/vite` / `examples/next-blog`). Remove now-unused
server-action/in-memory deps if any. Keep it a **published-shape template** (it's copied by users) —
no workspace-only imports, no `examples-shared`.

## Testing (within this sub-project)

- Port the vite template's **`sync.smoke.test.ts`** and **`ssr.smoke.test.ts`** (vitest) to
  `templates/next`, adapted to its module layout — same in-memory-socket sync assertions
  (create→stale, update→patch, serve→grant→subscribe→patch).
- Manual verification via the `run`/`verify` skill: two browser tabs, add a todo (badge in the
  other), toggle a todo (live check in the other).
- Full browser e2e is **Spec 2** — this sub-project only needs the app working + smoke tests green.

## Risks / open questions (verify during implementation)

1. **HydrateSnapshot vs HydrationStream.** Confirm `<HydrationStream />` + `StoreProvider ssr`
   replaces `HydrateSnapshot.tsx` cleanly (next-blog has no HydrateSnapshot); if App Router needs a
   different hydration handoff for the todos page, keep the minimal piece.
2. **Custom server + Next 16 App Router.** next-blog runs a custom `server.mts` with a WS upgrade
   split; confirm the same works on templates/next's Next version and that RSC/streaming still work
   under it. `next.config.ts` may need no change, but verify (e.g. no conflict with Turbopack dev).
3. **`template.json` / scaffolding metadata.** `templates/next/template.json` may enumerate files or
   scripts; update it for the new `server.mts` + `dev`/`start` commands so the template scaffolds
   correctly.
4. **PGlite in the Next graph.** Ensure the single-hub / single-PGlite invariant holds (vite template
   pins a `globalThis.__rxfyPglite`; next-blog pins the hub in `server/sync.ts`) — the RSC/SSR graph
   must not spin up a second hub or DB.
5. **WS port.** Unlike `waku-blog`, next-blog serves the WS on the **same** HTTP port at `/live` (via
   the upgrade split), so no sibling-port issue — keep that approach (simpler for e2e port
   assignment in Spec 2).

## Success criteria

- `pnpm --filter rxfy-template-next dev` and `... build && ... start` run a live todos app.
- Two tabs: adding a todo shows the other tab's updates badge → apply reveals it; toggling a todo
  updates the other tab live with no refresh.
- Ported `sync.smoke.test.ts` / `ssr.smoke.test.ts` pass; `check-types`, `lint`, `build` green.
- `templates/next` and `templates/vite` expose the same `sync-todos` selectors, unblocking Spec 2's
  shared spec.
