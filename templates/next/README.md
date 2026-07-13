# rxfy + Next.js (App Router)

A [Next.js](https://nextjs.org) App Router starter wired to [rxfy](https://rxfy.vanya2h.me)'s SSR store using **React Server Components**: a Server Component fetches on the server, dehydrates the result, and hands it to the client, which reads it from a normalized reactive store with zero fetch on first paint.

## Try it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The todo list is server-rendered (view source — the todos are in the HTML), and adding a todo runs a Server Action then updates the store reactively.

## How the SSR store works

- `src/app/page.tsx` — an **async Server Component** calls `prefetch(todosState, fetchTodos, {})` and renders `<HydrateSnapshot>` (seeds the store) before `<TodosView>` (reads it).
- `src/lib/ssr.ts` — `prefetch` runs the fetcher, normalizes into a fresh registry, and returns a serializable snapshot.
- `src/lib/todos.ts` — the model + state + an **isomorphic** `fetchTodos`: reads the in-memory store directly on the server, calls `/api/todos` on the client.
- `src/lib/actions.ts` — a **Server Action** that persists writes; `src/app/api/todos/route.ts` backs the client fetch.
- `src/lib/store.ts` — an in-memory stand-in for a real database. Swap it out.

## Scripts

| Script             | What it does               |
| ------------------ | -------------------------- |
| `pnpm dev`         | Next dev server            |
| `pnpm build`       | Production build           |
| `pnpm start`       | Serve the production build |
| `pnpm test`        | SSR-prefetch smoke test    |
| `pnpm lint`        | ESLint                     |
| `pnpm check-types` | Typecheck                  |

Docs: https://rxfy.vanya2h.me
