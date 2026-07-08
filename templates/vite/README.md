# rxfy live app

A fully server-side-rendered live app: [rxfy](https://rxfy.vanya2h.me) normalized stores on the client, a [Hono](https://hono.dev) server that owns writes through `rxfy-server`, and real-time updates pushed over WebSocket. The database is [PGlite](https://pglite.dev) (embedded Postgres) via [Drizzle](https://orm.drizzle.team) — zero setup, swap in a real Postgres when ready.

## Try it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 in **two tabs**. Toggling a todo in one tab updates the other instantly (a live `patch`); adding a todo shows a "1 new — refresh" badge in the other tab (a `stale` invalidation — lists never mutate themselves).

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server (Vite middleware mode + SSR) on port 3000 |
| `pnpm build` | Client + SSR production bundles into `dist/` |
| `pnpm preview` | Run the production build |
| `pnpm test` | Live-write + SSR smoke tests |
| `pnpm check-types` | Typecheck client and server projects |

## Where things live

- `src/todos.ts` — the model + state (shared by server and client)
- `src/db/schema.ts` / `src/resources.ts` — Drizzle table bound to the model
- `server/api.ts` — reads return `{ data, grants }`; writes go through `live.create/update`
- `src/pages/TodosPage.tsx` — `useStateData`, entity subscription, updates badge
- `src/entry-server.tsx` / `src/entry-client.tsx` — SSR dehydrate → hydrate loop

Docs: https://rxfy.vanya2h.me/getting-started/framework
