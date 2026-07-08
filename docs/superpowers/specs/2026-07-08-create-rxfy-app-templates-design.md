# create-rxfy-app template list — design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Define the set of official templates bundled with `create-rxfy-app`, their stack depth, content policy, and picker ordering. Today the CLI ships a single `vite` template (full live stack). This design expands the list to seven templates, flat (one per framework), each at one fixed stack depth.

## Decisions

- **Flat list, one template per framework** — no framework × depth matrix, no second picker prompt.
- **Near-empty starters** — templates ship the minimum wiring that proves the integration works, not a demo app.
- **Stack depth per framework:** Vite and React Router v7 carry the full live stack; Next.js, Waku, and TanStack Start are SSR-store; Vite SPA and Expo are client-only store.

## Template list

| Name | Display | Stack depth | Contents |
|---|---|---|---|
| `vite-spa` | Vite (client-only SPA) | store only | `createModel` + `defineState` + `useStateData` + `StoreProvider`; no server, no SSR. The "hello rxfy" entry point. |
| `vite` | Vite + Hono (live SSR app) | live | Exists today. Vite SSR, React Router, Hono, Drizzle + PGlite, WebSocket live updates. Slimmed to one entity / one page (see content policy). |
| `react-router` | React Router v7 (live SSR app) | live | RR7 framework mode with a custom Hono server carrying `rxfy-server` + `rxfy-ws`; dehydrate/hydrate SSR. |
| `next` | Next.js (App Router) | SSR store | `rxfy` + `rxfy-react` with `rxfy-react/next` `<HydrationStream />` streaming SSR. No live stack (serverless deployment reality). |
| `waku` | Waku | SSR store | RSC-based minimal framework; rxfy SSR hydration in client islands. |
| `tanstack-start` | TanStack Start | SSR store | TanStack Start with rxfy dehydrate/hydrate SSR. |
| `expo` | Expo (React Native) | store only | Client-only store on React Native. Ships last; treated as experimental until its CI story is proven (Metro toolchain, no Vite/tsup). |

## Content policy: near-empty starter

Every template contains exactly one of everything needed to prove the wiring, and nothing decorative:

- **Store-only** (`vite-spa`, `expo`): one model, one state with a stub fetch, one screen rendering it via `useStateData`, one mutation. No routing beyond the framework default.
- **SSR store** (`next`, `waku`, `tanstack-start`): the same single model/state, plus the dehydrate/hydrate round-trip wired end-to-end — the part users cannot easily assemble from docs alone.
- **Live** (`vite`, `react-router`): one entity through the whole pipe — Drizzle schema → resource → grant → live mutation → patch visible in a second tab. Server and db files exist, but exactly one of each concept.

Consequence: the existing `vite` template (todos app with About page) is slimmed to match this policy — one entity, one page.

## Picker ordering

`listTemplates` currently sorts alphabetically, which would order the picker `expo` first and `vite-spa` last. Add an optional numeric `order` field to `template.json`; sort by `(order, name)` with missing `order` sorting last. Target picker order, simplest → richest:

1. `vite-spa`
2. `vite`
3. `react-router`
4. `next`
5. `waku`
6. `tanstack-start`
7. `expo`

## Rollout

Templates are independently shippable — the CLI discovers whatever is present in `dist/templates`, so each lands as its own PR:

1. `order` field in `template.json` + sort change in `listTemplates` (unblocks curated ordering).
2. `vite-spa` (cheapest, no server).
3. Slim the existing `vite` template to the content policy.
4. `react-router` (second live template).
5. `next`, `waku`, `tanstack-start` (SSR-store trio; the corresponding `examples/*` apps are the reference for the integration wiring, not the content).
6. `expo` (last; new toolchain, experimental).

## Testing

Each new template follows the existing pattern: `scripts/prepare-templates.ts` copies it into `dist/templates` with workspace deps rewritten to published versions, and the scaffold tests in `src/scaffold.test.ts` cover discovery/copy mechanics generically. Templates with a runtime surface keep smoke tests in-repo (like the current `ssr.smoke.test.ts` / `live.smoke.test.ts` in the vite template) so `turbo test` catches breakage against workspace packages.

## Out of scope

- Astro template (islands fragment the shared-store model; poor fit).
- A framework × depth matrix or a second "stack depth" picker prompt.
- Blog-style demo content (lives in `examples/`, not templates).
