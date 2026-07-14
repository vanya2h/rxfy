# rxfy client-only SPA

The simplest [rxfy](https://rxfy.vanya2h.me) setup: a Vite + React SPA with one model, one state, and one mutation. No server, no SSR — `src/todos.ts` is the whole data layer.

## Try it

```bash
pnpm install
pnpm dev
```

## Where things live

- `src/todos.ts` — model + state + stub fetch (replace `fetchTodos` with your API call)
- `src/App.tsx` — `useStateData` for the list, `useModelStore(...).get(id)` per entity
- `src/main.tsx` — `<StoreProvider>` wraps the app once

## Scripts

| Script             | What it does                   |
| ------------------ | ------------------------------ |
| `pnpm dev`         | Vite dev server                |
| `pnpm build`       | Production bundle into `dist/` |
| `pnpm preview`     | Serve the production build     |
| `pnpm test`        | Render smoke test              |
| `pnpm check-types` | Typecheck                      |

Docs: https://rxfy.vanya2h.me
