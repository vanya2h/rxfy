# Waku Blog Example — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Goal

Add a new example app, `examples/waku-blog`, that integrates rxfy/rxfy-react with
[Waku](https://waku.gg) — "the minimal React framework." The example showcases Waku-specific
features (static SSG home, dynamic SSR detail, client-side navigation) while reusing the existing
`next-blog` domain (posts / users / comments) so the integration is directly comparable across
frameworks.

It joins the existing SSR examples — `next-blog` (RSC + streaming) and `rr7-blog` (classic SSR) —
as the third framework integration, demonstrating rxfy's SSR story on an RSC framework that exposes
**no script-injection seam**.

## Background: why Waku is different

rxfy's SSR works by capturing fetch results into a per-request `ModelRegistry`, serializing them
(`dehydrate`), getting that snapshot into the HTML, and rehydrating on the client (`StoreProvider`
drains it — zero client fetches on first paint).

The "get the snapshot into the HTML" step differs per framework:

| Example       | Architecture               | Injection seam rxfy uses                        | Explicit prefetch? |
| ------------- | -------------------------- | ----------------------------------------------- | ------------------ |
| next-blog     | RSC + streaming            | `useServerInsertedHTML` (`HydrationStream`)     | No                 |
| rr7-blog      | classic SSR                | custom `entry.server.tsx` + `onAllReady` inject | No                 |
| **waku-blog** | RSC, **no injection seam** | none available                                  | **Yes**            |

- **next-blog** works because Next exposes `useServerInsertedHTML`. `HydrationStream` (a client
  component) uses it to flush a `<script>` of the dehydrated delta on every streaming flush.
- **rr7-blog** works because React Router framework mode is classic (non-RSC) SSR with a custom
  `entry.server.tsx`: `useStateData` suspends during the buffered `renderToPipeableStream` render,
  and `onAllReady` injects `hydrationScript(dehydrate(registry))` before `</body>`.
- **Waku** is RSC-based and (confirmed from its docs) exposes neither `useServerInsertedHTML` nor any
  documented way to inject `<script>` into the streamed HTML after Suspense resolves. Middleware is
  Hono-level (response-body scope, no access to the in-render registry); interceptors wrap renders in
  request scope but don't reach the HTML stream. So `HydrationStream` cannot be ported (it imports
  from `next/navigation`), and the rr7 buffered-inject pattern has no equivalent seam.

**Consequence:** with no seam to inject the snapshot _after_ render, the Waku example produces the
snapshot _before_ render — in the async Server Component — and passes it down as a serializable prop.
This is the RSC-idiomatic shape and requires **no library change**.

## Approach (decision)

**Direct server-side prefetch + prop hydration.** Each Waku page is an async Server Component that:

1. Calls the rxfy fetcher directly into a fresh per-request `ModelRegistry`.
2. `dehydrate`s the registry to a JSON-safe snapshot.
3. Renders a small `HydrateSnapshot` client component that merges the snapshot into the **single,
   persistent** `StoreProvider` registry owned by the root layout (`_layout.tsx`).

The `StoreProvider` lives in the layout (not per page) so the store persists across client
navigations; each page contributes its own snapshot via `HydrateSnapshot`, which calls
`hydrate(registry, snapshot)` once per mount (in a `useState` initializer, on both SSR and client).
During Waku's SSR of the client tree, `useStateData` / `useModelStore` find the data already in the
store and render fully — no fetch. On the client, hydration matches; subsequent client navigations
reuse the warm layout-owned store with no refetch.

The snapshot (`dehydrate` output) is JSON-serializable, so it crosses Waku's RSC boundary cleanly as
a prop.

### Rejected alternatives

- **`collectStateData` + `renderToString` two-pass** — in Waku's RSC build a `'use client'` component
  imported into a Server Component is a _reference_, so `renderToString` can't execute the real tree.
  Fragile / likely broken.
- **Custom server + buffered `hydrationScript` (rr7-style)** — Waku exposes no `renderToPipeableStream`
  seam over the client tree nor post-Suspense script injection. Would require abusing Hono middleware
  plus an interceptor-installed `AsyncLocalStorage` to share the registry and post-process the HTML
  body. Fights Waku's managed pipeline; makes a worse example.

## The prefetch helper (example-local, no library change)

A ~6-line helper in `src/ssr.ts`, composed only from already-public `rxfy` exports
(`createModelRegistry`, `normalizeResult`, `createFulfilled`, `stableStringify`, `dehydrate`):

```ts
import { createFulfilled, createModelRegistry, dehydrate, normalizeResult, stableStringify } from "rxfy";
import type { DehydratedState, StateDescriptor } from "rxfy";

export async function prefetch<TParams, TShape>(
  state: StateDescriptor<TParams, TShape, any>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): Promise<DehydratedState> {
  const registry = createModelRegistry();
  const result = await fetchFn(params, new AbortController().signal);
  const ids = normalizeResult(registry, state.fields, result);
  registry.queries.getQuery(`${state.key}:${stableStringify(params)}`).set(createFulfilled(ids));
  return dehydrate(registry);
}
```

**Tradeoff (named honestly):** this reproduces rxfy's `${key}:${stableStringify(params)}` cache-key
convention locally rather than the library owning it. Acceptable for an example — `stableStringify`
is a public export and that key format is effectively the SSR hydration contract. (Exact generic
signature to be finalized against the published `StateDescriptor` type during implementation.)

## Package structure

New private workspace package, mirroring the other examples' conventions.

```
examples/waku-blog/
  package.json            # name: rxfy-example-waku-blog, private, scripts: dev/build/start/lint/check-types
  tsconfig.json
  eslint.config.ts
  waku.config.ts          # only if needed beyond defaults
  src/
    blog.ts               # ported from next-blog: schemas, models, states, fetchers, mutations
    db.ts                 # ported seed data
    ssr.ts                # prefetch() helper (above)
    providers.tsx         # 'use client' — RxfyProvider wrapping the persistent StoreProvider
    pages/
      _layout.tsx         # root layout: <html>/<body>, global styles, RxfyProvider, nav
      index.tsx           # Server Component, getConfig { render: 'static' } → prefetch + HydrateSnapshot + PostList
      posts/
        [slug].tsx        # Server Component, getConfig { render: 'dynamic' } → prefetch + HydrateSnapshot + PostDetail
    components/           # 'use client', ported from next-blog
      HydrateSnapshot.tsx # merges a page snapshot into the layout's shared registry
      PostList.tsx
      PostDetail.tsx
      AddCommentForm.tsx
    styles.css
  README.md
```

**Dependencies:** `waku`, `react`/`react-dom` 19, `rxfy`/`rxfy-react` (`workspace:*`), `rxjs`, `zod`,
`lodash`; dev: types, `@vanya2h/eslint-config`, `eslint`, `typescript`, `rimraf`. Scripts:
`dev: waku dev`, `build: waku build`, `start: waku start`, `lint: eslint .`, `check-types: tsc --noEmit`.

## Components & data flow

`blog.ts` / `db.ts` are ported verbatim from `next-blog` (same `userModel`/`postModel`/`commentModel`,
`postsState`/`postDetailState`, `fetchPosts`/`fetchPostDetail`, `createComment`). Models keep their
`name` and states keep their `key` (required for dehydration).

`providers.tsx` (`'use client'`) owns the single persistent registry (rendered once in the layout):

```tsx
"use client";
import { StoreProvider } from "rxfy-react";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  return <StoreProvider ssr>{children}</StoreProvider>;
}
```

`components/HydrateSnapshot.tsx` (`'use client'`) merges a page's snapshot into that registry once:

```tsx
"use client";
import { useState } from "react";
import { type DehydratedState, hydrate } from "rxfy";
import { useModelRegistry } from "rxfy-react";

export function HydrateSnapshot({ snapshot }: { snapshot: DehydratedState }) {
  const registry = useModelRegistry();
  useState(() => {
    hydrate(registry, snapshot);
    return null;
  });
  return null;
}
```

**Static home — `pages/index.tsx`:**

```tsx
import { fetchPosts, postsState } from "../blog";
import { HydrateSnapshot } from "../components/HydrateSnapshot";
import { prefetch } from "../ssr";
import PostList from "../components/PostList";

export default async function HomePage() {
  const snapshot = await prefetch(postsState, fetchPosts, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostList />
    </>
  );
}

export const getConfig = async () => ({ render: "static" }) as const;
```

**Dynamic detail — `pages/posts/[slug].tsx`:**

```tsx
import type { PageProps } from "waku/router";
import { fetchPostDetail, type PostId, postDetailState } from "../../blog";
import { HydrateSnapshot } from "../../components/HydrateSnapshot";
import { prefetch } from "../../ssr";
import PostDetail from "../../components/PostDetail";

export default async function PostPage({ slug }: PageProps<"/posts/[slug]">) {
  const postId = slug as PostId;
  const snapshot = await prefetch(postDetailState, fetchPostDetail, { postId });
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostDetail postId={postId} />
    </>
  );
}

export const getConfig = async () => ({ render: "dynamic" }) as const;
```

(Exact Waku page-prop / `getConfig` / params API to be confirmed against the installed Waku version
during implementation — the shape above follows current Waku docs.)

**Client components** (`PostList`, `PostDetail`, `AddCommentForm`) are ported from `next-blog` with two
changes:

- `next/link` → Waku's `Link` (and `useRouter` where programmatic nav is used) for the back link and
  post links. This exercises client-side navigation: the rxfy store persists across transitions, so
  navigating list ↔ detail does not refetch already-hydrated entities.
- Otherwise identical: `useStateData`, `useModelStore`, `Pending`, nested `<Pending>` (not
  `combineLatest`) to keep buffered-SSR sync probing working.

**Mutations:** add-comment stays a **client-side rxfy mutation** via `mutations.addComment` (ported
from next-blog — client-only/reactive). No server action (per scope decision). The new comment is
applied to the normalized store and reactively appears in the list.

## Render-mode behavior

- **`/` (static / SSG):** `prefetch(postsState, ...)` runs at build time; the posts list is baked into
  fully static HTML with rxfy data already hydrated.
- **`/posts/[slug]` (dynamic / SSR):** `prefetch(postDetailState, ...)` runs per request, contrasting
  request-time SSR against the static home.

## Error handling

- `fetchPostDetail` throws for unknown ids (existing behavior); the dynamic page surfaces it. We rely
  on Waku's default error handling for a missing post (optionally a `not-found` route if Waku provides
  one cheaply — otherwise the thrown error path is acceptable for an example).
- Client components retain `next-blog`'s `<Pending rejected={…}>` retry UI, which `reload()`s the
  state on the client.

## Testing & verification

This is an example app (private, never published), consistent with the other examples which carry no
unit tests. Verification is build- and run-based:

1. `pnpm install` resolves the new workspace package.
2. `pnpm --filter rxfy-example-waku-blog build` (i.e. `waku build`) succeeds — confirms SSG of `/` and
   the dynamic route compile.
3. `pnpm --filter rxfy-example-waku-blog check-types` and `lint` pass.
4. `turbo build` / `turbo lint` / `turbo check-types` at the repo root stay green.
5. Manual run (`waku dev` then `waku start`): home renders posts with **no client fetch** on first
   paint (verify via Network tab / the absence of a loading flash), detail page renders per request,
   client nav between list and detail reuses the store, and add-comment updates reactively.

No changeset is required: no published-package (`rxfy`, `rxfy-react`) API changes — the work is
entirely within a new private example.

## Out of scope (YAGNI)

- Server actions / `'use server'` mutations.
- A new data domain (reuse `next-blog`'s).
- Promoting `prefetch()` into `rxfy-react` as a public API (kept example-local; can be revisited later
  if more non-seam SSR integrations appear).
- Pagination / infinite scroll (covered by other examples).

```

```
