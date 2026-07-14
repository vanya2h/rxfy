# Working in a scaffolded template

`create-rxfy-app` scaffolds a fully-wired app. **The plumbing already exists — extend it, don't rebuild it.** This manifest says, per template, what is wired, where the model/state lives, where to add the next one, and what not to re-create.

All three share the same authoring shape: a model + state in `todos.ts`, entities normalized into a shared store, `data$` emitting **ids**. Adding a feature means adding another model/state (and, for the synced templates, another `defineResource` + write endpoint) — the store, SSR, and sync wiring are already in place.

## Detecting which template

| Signal                                                                       | Template   |
| ---------------------------------------------------------------------------- | ---------- |
| No `rxfy-server`/`rxfy-ws` deps, no `server/` dir, single `main.tsx` root    | `vite-spa` |
| `next` dep, `src/app/` App Router, `src/app/api/**/route.ts`                 | `next`     |
| `hono` dep, top-level `server/` dir, `entry-server.tsx` + `entry-client.tsx` | `vite`     |

## `vite-spa` — client-only store (Store level)

Client-only SPA. `rxfy` + `rxfy-react`, no server, no SSR, no sync.

- **Model + state + data:** `src/todos.ts` — `todoModel`, `todosState`, and a `fetchTodos` **stub** to replace with a real API call. Writes go through a `defineState` `mutations` map (`addTodo`).
- **Read UI:** `src/App.tsx` — `useStateData` + `<Pending>`, ids resolved via `useModelStore`.
- **Root:** `src/main.tsx`.
- **To add a feature:** new model + state in a sibling file (or `todos.ts`); wire a `useStateData` in a component. Add local writes via `mutations`. No server to touch.
- **Do not add:** SSR wiring or a sync client — this template is deliberately serverless. If the app needs those, that's a level-up, not a template edit.

## `next` — full sync + SSR (Next App Router)

Full real-time stack on Next: SSR via RSC prefetch + hydrate, REST writes, WebSocket sync, signed grants.

- **Model + state:** `src/todos.ts` — `todoModel`, `todosState` (**no** `mutations`: writes go through the API and land via `applyUpdates`/entity `patch`). Also exports `CreateTodoInputSchema`/`UpdateTodoInputSchema` for the server validators.
- **Resource binding:** `src/resources.ts` — `defineResource({ table, model })` + `createResourceRegistry`. **Server DB schema:** `src/db/schema.ts`.
- **Sync + service:** `src/server/sync.ts` (`createSync`), `src/server/todos-service.ts`, `src/server/db.ts`.
- **Write endpoints:** `src/app/api/todos/route.ts` (+ `[id]/route.ts`) call `sync.create/update/delete`. **Grant renewal:** `src/app/api/live/renew/route.ts`.
- **Client wiring:** `src/sync-client.ts` (`createSyncClient` with `renewUrl`), `src/providers.tsx` (`StoreProvider` `syncClient` + API provider). **Read UI:** `src/components/TodosView.tsx`; **RSC prefetch:** `src/app/page.tsx`.
- **To add an entity:** add a Drizzle table (`db/schema.ts`) → `defineResource` in `resources.ts` and register it → model + state in a `todos.ts` sibling → write routes under `src/app/api/<name>/` calling `sync.*` → read it with `useStateData`. Reuse the existing `sync`, `syncClient`, providers, and renew route as-is.
- **Do not rebuild:** the sync client, grant renewal route, providers, or SSR/hydration wiring — all present.

## `vite` — full sync + SSR (Vite + Hono)

Full real-time stack on Vite SSR + React Router + Hono, with WebSocket sync and PGlite.

- **Model + state:** `src/todos.ts` (same shape as `next`, no `mutations`, exports input schemas). **Resource:** `src/resources.ts`. **DB schema:** `src/db/schema.ts`.
- **Server (Hono):** `server/index.ts` (entry), `server/api.ts` (REST writes → `sync.*`), `server/ws.ts` (`createWsServer`), `server/sync.ts` (`createSync`), `server/render.ts` (SSR), `server/db.ts`.
- **Client:** `src/entry-client.tsx` / `src/entry-server.tsx` (SSR pair), `src/App.tsx`, `src/api-client.tsx`, `src/pages/TodosPage.tsx`.
- **To add an entity:** Drizzle table → `defineResource` + register → model + state → REST handler in `server/api.ts` calling `sync.*` → read with `useStateData`. Reuse the Hono server, WS server, SSR entries, and api-client unchanged.
- **Do not rebuild:** the Hono/WS server, SSR entry pair, or api-client — all present.

## Reading further

Once oriented, use the main library table in `SKILL.md`: `models-states.md` to declare the model/state, `sync-server.md` for `defineResource`/`sync.*`, `sync-client.md`/`sync-grants.md` for the client and grants, `react-bindings.md` to read it, `common-mistakes.md` when debugging.
