# Examples demo: plain value fields — design

**Date:** 2026-06-19
**Packages:** `examples/*` (demo only)
**Status:** Approved (design), pending implementation

> Supersedes earlier drafts of this doc that also covered a local/sync `useStateData({ initial })`
> mode and a lensable `atom$` handle. That mode was **removed** (`createAtom` is the right tool for
> pure local UI state); only the **plain value fields** feature ships, so the demo covers only that.

## Goal

Show the new **plain value fields** capability (bare zod schemas in `defineState({ model })`,
mixed alongside `array()`/`single()` entity fields) across the example apps with a small, consistent
addition: each example's normalized state gains a plain `meta` field returned by its fetch and
rendered as a caption — demonstrating plain values traveling **in one model alongside normalized
entities** (and, in SSR examples, dehydrating with the query).

## The pattern (consistent across examples)

Add a plain field to the example's existing `defineState` model:

```ts
const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: {
    posts: array(PostModel),                                        // entities (normalized → ids)
    authors: array(UserModel),                                      // entities
    meta: z.object({ total: z.number(), generatedAt: z.string() }), // plain (passed through)
  },
});
```

- The fetch function returns `meta` alongside the entities (mock/in-memory data — easy to add a
  `total` count and an ISO `generatedAt` timestamp).
- The list component reads `data$` and renders a small caption from the plain field, e.g.
  **"12 posts · loaded 14:03"**. `data$`'s `meta` is the real object (not an id), while `posts`/
  `authors` are id arrays read through `useModelStore`.
- Keep each change tiny: the `meta` field + its fetch value + a one-line caption.

## Per example

| Example | Fetched state | Plain field added | Caption |
|---|---|---|---|
| next-blog | `postsState` (posts + authors) | `meta: { total, generatedAt }` | "{total} posts · loaded {time}" in PostList |
| rr7-blog | `postsState` | `meta: { total, generatedAt }` | same |
| waku-blog | `postsState` | `meta: { total, generatedAt }` | same (needs `pnpm install` first — deps not installed) |
| vite-todo | `todosState` | `meta: { total, generatedAt }` | "{total} todos · loaded {time}" |
| vite-realtime-todos | `todosState` | `meta: { total, generatedAt }` | same |
| vite-ssr-pagination | uses `useStatePagedData` (no `defineState` model) | a small **header** `defineState({ model: { topUser: single(UserModel), meta: z.object({ total, generatedAt }) } })` + fetch, to show the entity+plain mix | "Top: {name} · {total} users · loaded {time}" |

Field names/shape adapt to each example's real schema and fetch. Prefer `generatedAt` as an ISO
string set server-side; render with `new Date(generatedAt).toLocaleTimeString()`.

For `vite-ssr-pagination`, the header state is keyed so it participates in SSR like the rest; it is a
minimal addition (one small fetch + caption) purely to demonstrate plain-alongside-entity in that
example. If the extra fetch endpoint is awkward, fall back to a plain-only `meta` state and note it.

## Verification

- Each touched example: its `build` (or `check-types`) passes. `waku-blog` needs `pnpm install`
  first; if its toolchain can't run here, make the change and note it wasn't built.
- Run at least one example (e.g. `vite-todo`) to confirm the caption renders from the plain field and
  entity rendering is unaffected.
- No library changes — `rxfy`/`rxfy-react` already ship plain value fields.

## Out of scope / YAGNI

- No local/sync `useStateData` mode, no `atom$`, no `createAtom`+Lens view-options panel.
- No new entity schema fields beyond the additive plain `meta` (and, for pagination only, a small
  header state). No persistence / UI-preference features.

## Affected files

- `examples/{next-blog,rr7-blog,waku-blog}/**` — `postsState.meta` + fetch value + PostList caption.
- `examples/{vite-todo,vite-realtime-todos}/**` — `todosState.meta` + fetch value + caption.
- `examples/vite-ssr-pagination/**` — small header `defineState` (single + plain) + fetch + caption.
