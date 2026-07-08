# create-rxfy-app: Next.js template — design

**Date:** 2026-07-08
**Status:** Approved
**Parent spec:** `docs/superpowers/specs/2026-07-08-create-rxfy-app-templates-design.md` (template list)

## Goal

Add the `next` template to `create-rxfy-app`: a Next.js App Router app wired to rxfy's SSR store, shipped as a near-empty starter (one model, one state, one mutation, one page). Slots into the picker at `order: 4`.

## Key decision: RSC prefetch, not HydrationStream

rxfy supports two Next-compatible SSR patterns:

- **Pattern A — streaming SSR of client components** (`examples/next-blog`): a `"use client"` component calls `useStateData({ ssr })`; the fetch suspends during SSR and `<HydrationStream />` (from `rxfy-react/next`) streams the dehydrated snapshot as Suspense boundaries resolve. The data-fetching component is not a true Server Component.
- **Pattern B — RSC prefetch + snapshot seed** (`examples/waku-blog`): an async **Server Component** fetches via a `prefetch()` helper, receives a serializable `DehydratedState`, and passes it as a prop to a small `<HydrateSnapshot>` client component that merges it into the store once. Data fetching lives in an RSC — the real-world App Router idiom.

The parent template-list spec assumed Pattern A ("SSR store with HydrationStream"). This template deliberately uses **Pattern B** instead, because the goal is to mimic a real-world App Router app where data is fetched in Server Components. `HydrationStream` is therefore not used in this template. Both `prefetch` and `HydrateSnapshot` are app-level helpers built on public `rxfy` APIs (proven by `waku-blog`), so the template ships copies of them.

## Architecture & data flow

One entity (`todo`), one page (`/`):

1. **`src/lib/store.ts`** — a tiny in-memory array of todos (`listTodos()`, `createTodo(title)`), the stand-in for a real backend. Read directly on the server; a comment notes it resets on reload / isn't shared across workers, and to swap in a real DB.
2. **`src/lib/todos.ts`** — the rxfy `todoModel` (`createModel`, `name: "todo"`) and `todosState` (`defineState`, `key: "todos"`, `model: { todos: array(todoModel) }`, `mutations: { addTodo }`), plus an **isomorphic** `fetchTodos`: on the server (`typeof window === "undefined"`) it dynamically imports `./store` and reads directly; on the client it `fetch("/api/todos")`.
3. **`src/app/api/todos/route.ts`** — `GET` Route Handler returning `{ todos: listTodos() }`, backing the client branch of `fetchTodos` (the real-world HTTP path).
4. **`src/lib/ssr.ts`** — `prefetch(state, fetchFn, params)`: create a fresh registry, run the fetcher, `normalizeResult` into it, seed the query cache under `${state.key}:${stableStringify(params)}` as `createFulfilled(ids)`, return `dehydrate(registry)`. Copied from `waku-blog/src/ssr.ts`.
5. **`src/app/page.tsx`** — async **Server Component**: `const snapshot = await prefetch(todosState, fetchTodos, {})`; renders `<HydrateSnapshot snapshot={snapshot} />` then `<TodosView />`.
6. **`src/components/HydrateSnapshot.tsx`** — `"use client"`; merges the snapshot into the shared registry once via `hydrate(registry, snapshot)` inside a `useState` initializer. Copied from `waku-blog/src/components/HydrateSnapshot.tsx`.
7. **`src/components/TodosView.tsx`** — `"use client"`; `useStateData({ state: todosState, fetchFn: fetchTodos, params })` reads the already-seeded store (zero client fetch on first paint); a per-entity `TodoItem` subscribes via `useModelStore(todoModel).get(id)`; an add form calls the server action then updates the store via `mutations.addTodo`.
8. **`src/lib/actions.ts`** — `"use server"`; `createTodo(title)` appends to `store.ts` and returns the created `Todo` (the real-world write path).
9. **`src/providers.tsx`** — `"use client"`; wraps children in `<StoreProvider ssr>`. **`src/app/layout.tsx`** — RSC; `<html>`/`<body>` wrapping `<RxfyProvider>`.

### Write flow

`TodosView` submit → `await createTodo(title)` (server action persists to `store.ts`) → `mutations.addTodo(created)` (normalizes the entity into the store and appends its id, reactively updating the list). A subsequent server fetch would return it from the store.

## Styling

Tailwind v4 via `@tailwindcss/postcss`: `src/app/globals.css` (`@import "tailwindcss";`) + `postcss.config.mjs`. Minimal utility classes in the components — enough to not look broken, not a design system.

## Tooling

- **ESLint** included (create-next-app convention): `eslint-config-next` with an `eslint.config.mjs` flat config; `"lint": "eslint ."`.
- **Types:** `tsconfig.json` (Next defaults, `moduleResolution: bundler`, the `next` plugin), `next-env.d.ts`, `"check-types": "tsc --noEmit"`.
- **`next.config.ts`** — minimal (no `transpilePackages`; rxfy/rxfy-react resolve as published deps once `workspace:*` is rewritten at build).
- Uses the `src/` directory (matches `next-blog`).

## Files

```
templates/next/
  template.json            # { order: 4, display: "Next.js (App Router)", description: ... }
  package.json             # name rxfy-template-next
  next.config.ts
  tsconfig.json
  next-env.d.ts
  eslint.config.mjs
  postcss.config.mjs
  .gitignore               # node_modules, .next, *.tsbuildinfo, .env*
  README.md
  vitest.config.ts
  src/app/layout.tsx
  src/app/page.tsx
  src/app/globals.css
  src/app/api/todos/route.ts
  src/providers.tsx
  src/components/HydrateSnapshot.tsx
  src/components/TodosView.tsx
  src/lib/todos.ts
  src/lib/store.ts
  src/lib/actions.ts
  src/lib/ssr.ts
  src/lib/ssr.test.ts
```

## Dependencies

- **dependencies:** `next` (^16), `react`, `react-dom`, `rxfy` (workspace:*), `rxfy-react` (workspace:*), `rxjs`, `zod`, `lodash`.
- **devDependencies:** `@types/node`, `@types/react`, `@types/react-dom`, `@types/lodash`, `typescript`, `eslint`, `eslint-config-next`, `tailwindcss`, `@tailwindcss/postcss`, `vitest`.

`workspace:*` deps are rewritten to published versions by `scripts/prepare-templates.ts` at CLI build time.

## Testing

`src/lib/ssr.test.ts` (vitest, node environment) — the didactic core of the SSR round-trip, exercisable without the Next runtime:

- `prefetch(todosState, fetchTodos, {})` returns a `DehydratedState` whose `queries` contains the `todos:{}` entry in FULFILLED status holding id(s), and whose `models.todo` contains the seeded entities.

This runs `fetchTodos` in node (window undefined → server branch → reads `store.ts`), so it covers the fetcher's server branch, normalization, query-cache seeding, and dehydration in one test. A `vitest.config.ts` mirrors the other templates (node env, `globals: false`).

## Rollout / integration

Mirrors the vite-spa rollout:

1. Create `templates/next/` with all files; register it in the pnpm workspace (`pnpm install`).
2. Add `"rxfy-template-next": "workspace:*"` to `packages/create-rxfy-app` devDependencies (so turbo's `^build`/`^test` graph covers it).
3. Add the `next` row to `packages/create-rxfy-app/README.md`.
4. Verify: `pnpm --filter create-rxfy-app build` prepares `next`; scaffold from the built CLI; picker lists `vite-spa, vite, next` in order.
5. Extend the pending `create-rxfy-app` changeset to mention the `next` template.

## Out of scope

- HydrationStream / Pattern A (deliberately not used here; may seed a future streaming-focused variant).
- A detail route (`/posts/[id]`) — one page only, per the content policy.
- shadcn / component library, multiple entities, auth, real database.
- `not-found.tsx` — Next's default 404 suffices for a near-empty starter.
