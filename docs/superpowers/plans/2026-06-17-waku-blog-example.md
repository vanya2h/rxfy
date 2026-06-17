# Waku Blog Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `examples/waku-blog`, a Waku (RSC) app that integrates rxfy via server-side prefetch + prop hydration, showcasing static SSG home, dynamic SSR detail, and client-side navigation over the reused `next-blog` domain.

**Architecture:** Each Waku page is an async Server Component that calls a rxfy fetcher into a fresh `ModelRegistry`, `dehydrate`s it, and renders a small `HydrateSnapshot` client component that merges that JSON-safe snapshot into a single `StoreProvider` registry owned by the persistent root layout. Client components read reactively from the hydrated store — zero client fetch on first paint, and the store persists across client navigations. No library change (helper is example-local, built from public `rxfy` exports); no changeset.

**Tech Stack:** Waku `1.0.0-beta.3`, React 19, rxfy / rxfy-react (`workspace:*`), RxJS 7, Zod 4, lodash.

**Spec:** `docs/superpowers/specs/2026-06-17-waku-blog-example-design.md`

**Verification model:** Example apps in this repo carry **no unit tests** (consistent with `next-blog`, `rr7-blog`). The per-task verification gate is therefore **type-check + lint + build** (and, at the end, a manual run). Treat the "Run" steps as the tests: they must pass before committing.

**Commit convention:** This repo uses plain commit messages with **no** `Co-Authored-By` / AI-attribution trailers.

**Note on Waku API:** Code below follows Waku 1.0-beta docs (`PageProps<'/posts/[slug]'>`, `Link`/`useRouter` from `"waku"`, `_layout.tsx` with `{ children }`, `getConfig` → `{ render: "static" | "dynamic" }`). If the installed `1.0.0-beta.3` differs, adjust import paths/prop shapes to match the installed types — the rxfy integration (prefetch → HydrateSnapshot → StoreProvider) is independent of those specifics.

---

## File Structure

```
examples/waku-blog/
  package.json            # rxfy-example-waku-blog (private); scripts dev/build/start/clean/lint/check-types
  tsconfig.json
  turbo.json              # extends //, build outputs
  eslint.config.ts
  src/
    styles.css            # ported from next-blog globals.css
    blog.ts               # ported: schemas, models, states, fetchers, createComment
    db.ts                 # ported seed data
    ssr.ts                # prefetch() helper (public rxfy exports only)
    providers.tsx         # 'use client' RxfyProvider — StoreProvider (persistent registry)
    components/
      HydrateSnapshot.tsx # 'use client' — merges a page snapshot into the layout registry
      PostList.tsx        # 'use client' — ported, next/link → waku Link
      PostDetail.tsx      # 'use client' — ported, next/link → waku Link
      AddCommentForm.tsx  # 'use client' — ported verbatim
    pages/
      _layout.tsx         # root layout: <html>/<body>, styles, RxfyProvider, nav
      index.tsx           # Server Component, getConfig render:'static' → prefetch + PostList
      posts/
        [slug].tsx        # Server Component, getConfig render:'dynamic' → prefetch + PostDetail
  README.md
```

---

## Task 1: Scaffold the package

**Files:**
- Create: `examples/waku-blog/package.json`
- Create: `examples/waku-blog/tsconfig.json`
- Create: `examples/waku-blog/turbo.json`
- Create: `examples/waku-blog/eslint.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rxfy-example-waku-blog",
  "version": "0.1.0",
  "private": true,
  "description": "example Waku (minimal React framework) blog app using rxfy",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "waku dev",
    "build": "waku build",
    "start": "waku start",
    "clean": "rimraf dist .waku",
    "lint": "eslint .",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "lodash": "^4.17.21",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.8.2",
    "waku": "1.0.0-beta.3",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/lodash": "^4.17.17",
    "@types/node": "^22.0.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vanya2h/eslint-config": "^0.4.0",
    "eslint": "^9.27.0",
    "rimraf": "^6.0.1",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["react", "react-dom", "node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", ".waku"]
}
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": ["dist/**", ".waku/**"]
    }
  }
}
```

- [ ] **Step 4: Create `eslint.config.ts`**

```ts
import { config } from "@vanya2h/eslint-config/react";
import type { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".waku/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
```

- [ ] **Step 5: Install so the workspace resolves the new package**

Run: `pnpm install`
Expected: completes successfully; `rxfy-example-waku-blog` linked, `waku` + `react`/`react-dom` present under `examples/waku-blog/node_modules`.

- [ ] **Step 6: Commit**

```bash
git add examples/waku-blog/package.json examples/waku-blog/tsconfig.json examples/waku-blog/turbo.json examples/waku-blog/eslint.config.ts pnpm-lock.yaml
git commit -m "chore: scaffold waku-blog example package"
```

---

## Task 2: Port the blog domain and seed data

The domain is identical to `next-blog` — copy it verbatim so the integration is comparable.

**Files:**
- Create: `examples/waku-blog/src/blog.ts`
- Create: `examples/waku-blog/src/db.ts`

- [ ] **Step 1: Copy `blog.ts` and `db.ts` from next-blog**

Run:
```bash
cp examples/next-blog/src/blog.ts examples/waku-blog/src/blog.ts
cp examples/next-blog/src/db.ts examples/waku-blog/src/db.ts
```

These files have no Next.js imports (only `rxfy`, `zod`, and the local `db`), so they port unchanged. They define: `UserSchema`/`PostSchema`/`CommentSchema` + branded id schemas; `userModel`/`postModel`/`commentModel` (each with a `name`); `postsState` (key `"posts"`) and `postDetailState` (key `"post-detail"`, with an `addComment` mutation); `fetchPosts`/`fetchPostDetail` fetchers; and `createComment`. **Do not** remove the model `name`s or state `key`s — they are required for dehydration.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter rxfy-example-waku-blog check-types`
Expected: PASS (no errors). If `rxfy` types are not found, run `pnpm --filter rxfy build` first, then re-run.

- [ ] **Step 3: Commit**

```bash
git add examples/waku-blog/src/blog.ts examples/waku-blog/src/db.ts
git commit -m "feat: port blog domain + seed data into waku-blog"
```

---

## Task 3: Add the `prefetch` SSR helper

The non-React server-side seed: run the fetcher, normalize into a fresh registry, set the query-cache entry under the same `${key}:${stableStringify(params)}` key `useStateData` uses, and dehydrate.

**Files:**
- Create: `examples/waku-blog/src/ssr.ts`

- [ ] **Step 1: Write `ssr.ts`**

```ts
import {
  createFulfilled,
  createModelRegistry,
  type DehydratedState,
  dehydrate,
  normalizeResult,
  type StateDescriptor,
  stableStringify,
} from "rxfy";

/**
 * Server-side prefetch for Waku (RSC has no script-injection seam, so we produce the
 * dehydrated snapshot before render and pass it down as a serializable prop). Runs the
 * fetcher into a fresh per-request registry, normalizes the result, seeds the query cache
 * under the same key useStateData uses, and returns the snapshot for StoreProvider to ingest.
 */
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

- [ ] **Step 2: Type-check**

Run: `pnpm --filter rxfy-example-waku-blog check-types`
Expected: PASS. If the generic signature mismatches the published `StateDescriptor`/`normalizeResult` types, adjust the type parameters (the runtime body is correct; only annotations may need tweaking — e.g. `normalizeResult(registry, state.fields, result)` returning `QueryShapeOf<TShape>`).

- [ ] **Step 3: Commit**

```bash
git add examples/waku-blog/src/ssr.ts
git commit -m "feat: add example-local prefetch helper for waku SSR"
```

---

## Task 4: Add the providers and HydrateSnapshot

`RxfyProvider` owns the single persistent registry (in the layout). `HydrateSnapshot` merges each page's snapshot into that registry once, on both server render and client mount, so the store persists across client navigations.

**Files:**
- Create: `examples/waku-blog/src/providers.tsx`
- Create: `examples/waku-blog/src/components/HydrateSnapshot.tsx`

- [ ] **Step 1: Write `providers.tsx`**

```tsx
"use client";

import { StoreProvider } from "rxfy-react";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  return <StoreProvider ssr>{children}</StoreProvider>;
}
```

- [ ] **Step 2: Write `components/HydrateSnapshot.tsx`**

```tsx
"use client";

import { useState } from "react";
import { type DehydratedState, hydrate } from "rxfy";
import { useModelRegistry } from "rxfy-react";

/**
 * Merges a server-produced snapshot into the layout's shared registry exactly once
 * (the useState initializer runs once per mount, on both SSR and client). Rendered
 * before the data-reading components in each page so the store is populated when they read.
 */
export function HydrateSnapshot({ snapshot }: { snapshot: DehydratedState }) {
  const registry = useModelRegistry();
  useState(() => {
    hydrate(registry, snapshot);
    return null;
  });
  return null;
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter rxfy-example-waku-blog check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/waku-blog/src/providers.tsx examples/waku-blog/src/components/HydrateSnapshot.tsx
git commit -m "feat: add RxfyProvider + HydrateSnapshot for waku-blog"
```

---

## Task 5: Add styles and the root layout

**Files:**
- Create: `examples/waku-blog/src/styles.css`
- Create: `examples/waku-blog/src/pages/_layout.tsx`

- [ ] **Step 1: Copy the stylesheet from next-blog**

Run: `cp examples/next-blog/src/app/globals.css examples/waku-blog/src/styles.css`

(If `next-blog`'s CSS contains Next-font `@font-face`/variable references, drop those lines; keep the layout/typography rules. Plain CSS otherwise ports unchanged.)

- [ ] **Step 2: Write `pages/_layout.tsx`**

```tsx
import "../styles.css";
import { Link } from "waku";
import { RxfyProvider } from "../providers";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RxfyProvider>
          <div className="container">
            <header>
              <Link to="/">rxfy + Waku</Link>
            </header>
            <main>{children}</main>
          </div>
        </RxfyProvider>
      </body>
    </html>
  );
}

export const getConfig = async () => {
  return { render: "static" } as const;
};
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter rxfy-example-waku-blog check-types`
Expected: PASS. (If `import "../styles.css"` errors under TS, add a `src/css.d.ts` with `declare module "*.css";` and include it.)

- [ ] **Step 4: Commit**

```bash
git add examples/waku-blog/src/styles.css examples/waku-blog/src/pages/_layout.tsx
git commit -m "feat: add waku-blog root layout + styles"
```

---

## Task 6: Port the client components

Port `PostList`, `PostDetail`, `AddCommentForm` from `next-blog`, replacing `next/link` with Waku's `Link` (`href` → `to`). Everything else (rxfy hooks, nested `<Pending>`, mutation wiring) is unchanged.

**Files:**
- Create: `examples/waku-blog/src/components/PostList.tsx`
- Create: `examples/waku-blog/src/components/PostDetail.tsx`
- Create: `examples/waku-blog/src/components/AddCommentForm.tsx`

- [ ] **Step 1: Copy the three components**

Run:
```bash
cp examples/next-blog/src/components/PostList.tsx examples/waku-blog/src/components/PostList.tsx
cp examples/next-blog/src/components/PostDetail.tsx examples/waku-blog/src/components/PostDetail.tsx
cp examples/next-blog/src/components/AddCommentForm.tsx examples/waku-blog/src/components/AddCommentForm.tsx
```

- [ ] **Step 2: In `PostList.tsx`, swap the Next link for Waku's**

Replace the import line:
```tsx
import Link from "next/link";
```
with:
```tsx
import { Link } from "waku";
```
and change the post link element from:
```tsx
<Link href={`/posts/${post.id}`}>
  <h2>{post.title}</h2>
</Link>
```
to:
```tsx
<Link to={`/posts/${post.id}`}>
  <h2>{post.title}</h2>
</Link>
```
Leave the import path for `../blog` and all rxfy hooks (`useStateData`, `useModelStore`, `Pending`) unchanged.

- [ ] **Step 3: In `PostDetail.tsx`, swap the Next link for Waku's**

Replace:
```tsx
import Link from "next/link";
```
with:
```tsx
import { Link } from "waku";
```
and change the back link from:
```tsx
<Link className="back-link" href="/">
  ← All posts
</Link>
```
to:
```tsx
<Link className="back-link" to="/">
  ← All posts
</Link>
```
Leave everything else — `combineLatest` usage, nested `<Pending>`, `mutations.addComment` wiring — unchanged. (Note: the existing code uses nested `<Pending>` for entities and `combineLatest` only inside one already-resolved boundary; keep as-is since detail is request-time SSR.)

- [ ] **Step 4: `AddCommentForm.tsx` needs no edits**

It imports only from `../blog` and React; verify there is no `next/*` import. No changes required.

- [ ] **Step 5: Type-check + lint**

Run: `pnpm --filter rxfy-example-waku-blog check-types && pnpm --filter rxfy-example-waku-blog lint`
Expected: PASS. Fix any `next/link` leftover or unused-import lint errors.

- [ ] **Step 6: Commit**

```bash
git add examples/waku-blog/src/components/PostList.tsx examples/waku-blog/src/components/PostDetail.tsx examples/waku-blog/src/components/AddCommentForm.tsx
git commit -m "feat: port blog client components to waku-blog"
```

---

## Task 7: Add the pages (static home + dynamic detail)

**Files:**
- Create: `examples/waku-blog/src/pages/index.tsx`
- Create: `examples/waku-blog/src/pages/posts/[slug].tsx`

- [ ] **Step 1: Write `pages/index.tsx` (static / SSG)**

```tsx
import { HydrateSnapshot } from "../components/HydrateSnapshot";
import PostList from "../components/PostList";
import { fetchPosts, postsState } from "../blog";
import { prefetch } from "../ssr";

export default async function HomePage() {
  const snapshot = await prefetch(postsState, fetchPosts, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostList />
    </>
  );
}

export const getConfig = async () => {
  return { render: "static" } as const;
};
```

- [ ] **Step 2: Write `pages/posts/[slug].tsx` (dynamic / SSR)**

```tsx
import type { PageProps } from "waku/router";
import { HydrateSnapshot } from "../../components/HydrateSnapshot";
import PostDetail from "../../components/PostDetail";
import { fetchPostDetail, type PostId, postDetailState } from "../../blog";
import { prefetch } from "../../ssr";

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

export const getConfig = async () => {
  return { render: "dynamic" } as const;
};
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter rxfy-example-waku-blog check-types && pnpm --filter rxfy-example-waku-blog lint`
Expected: PASS. If `PageProps`/`waku/router` import path differs in `1.0.0-beta.3`, adjust to the installed type (the page still receives `slug`). If TS complains the snapshot prop crossing the RSC boundary isn't serializable, confirm `DehydratedState` is plain JSON (it is) — no change needed.

- [ ] **Step 4: Commit**

```bash
git add "examples/waku-blog/src/pages/index.tsx" "examples/waku-blog/src/pages/posts/[slug].tsx"
git commit -m "feat: add waku-blog static home + dynamic post pages"
```

---

## Task 8: Build, README, and full verification

**Files:**
- Create: `examples/waku-blog/README.md`

- [ ] **Step 1: Build the example**

Run: `pnpm --filter rxfy-example-waku-blog build`
Expected: `waku build` succeeds — SSG of `/` is emitted and the dynamic `/posts/[slug]` route compiles. Fix any build errors before continuing (most likely: a Waku page-export contract or a `'use client'` boundary issue).

- [ ] **Step 2: Manual run check**

Run: `pnpm --filter rxfy-example-waku-blog dev` (then open the served URL), or after build `pnpm --filter rxfy-example-waku-blog start`.
Verify:
1. `/` renders the posts list with **no loading flash / no client fetch** on first paint (check the Network tab — the data is in the initial HTML).
2. Clicking a post navigates to `/posts/<id>` and renders the article + comments.
3. Navigating back to `/` and into another post does **not** show a loading state for already-seen entities (shared store persists).
4. The add-comment form appends a comment reactively.
Stop the dev server when done.

- [ ] **Step 3: Write `README.md`**

```markdown
# rxfy + Waku blog example

A [Waku](https://waku.gg) (minimal React framework, RSC-based) blog using **rxfy** for
normalized, reactive state with SSR hydration. Companion to the `next-blog` (Next.js App Router)
and `rr7-blog` (React Router 7) examples — same domain, three frameworks.

## What it shows

- **Static home (`/`)** — `getConfig { render: "static" }`. Posts are prefetched and dehydrated
  at build time; the list ships in fully static HTML with rxfy data already hydrated.
- **Dynamic detail (`/posts/[slug]`)** — `getConfig { render: "dynamic" }`. Fetched and dehydrated
  per request.
- **Client navigation** — Waku `Link`; the rxfy store lives in the persistent root layout and
  survives route transitions, so seen entities are not refetched.

## How rxfy + Waku fit together

Waku is RSC-based and exposes no script-injection seam (unlike Next's `useServerInsertedHTML`,
which `rxfy-react/next`'s `HydrationStream` relies on, or React Router's custom `entry.server`).
So instead of injecting a snapshot *after* render, each page **prefetches before render**:

1. The page (a Server Component) calls a rxfy fetcher into a fresh `ModelRegistry`, then
   `dehydrate`s it — see `src/ssr.ts`.
2. The JSON-safe snapshot is passed as a prop to `<HydrateSnapshot>`, a client component that
   merges it into the single `StoreProvider` registry owned by the root layout (`src/providers.tsx`).
3. Client components (`useStateData`, `useModelStore`, `Pending`) read from the hydrated store —
   no client fetch on first paint.

`src/ssr.ts`'s `prefetch` is built only from public `rxfy` exports (`normalizeResult`,
`stableStringify`, `createFulfilled`, `dehydrate`) — no library changes required.

## Run

```bash
pnpm --filter rxfy-example-waku-blog dev     # http://localhost:3000
pnpm --filter rxfy-example-waku-blog build
pnpm --filter rxfy-example-waku-blog start
```
```

(Confirm the dev port Waku prints and update the README URL if it differs from `3000`.)

- [ ] **Step 4: Repo-wide verification stays green**

Run: `turbo build && turbo lint && turbo check-types`
Expected: all PASS, including the new `rxfy-example-waku-blog` package.

- [ ] **Step 5: Commit**

```bash
git add examples/waku-blog/README.md
git commit -m "docs: add waku-blog README"
```

---

## Self-Review (completed)

**Spec coverage:**
- Package/structure → Task 1, 5, 7. ✓
- Ported blog domain + seed data → Task 2. ✓
- Example-local `prefetch()` from public exports, no library change/changeset → Task 3. ✓
- Prop-based hydration via persistent layout registry → Tasks 4, 5 (refined from the spec's per-page-provider sketch to a layout-owned `StoreProvider` + `HydrateSnapshot`, to satisfy the "store persists across nav" requirement; noted in README). ✓
- Static home / dynamic detail → Task 7. ✓
- Client navigation (Waku `Link`) → Task 6 (component links) + Task 5 (header link). ✓
- Client-only add-comment mutation → Task 6 (AddCommentForm unchanged). ✓
- Build/lint/run verification → Task 8. ✓
- No server action, no new domain, no changeset → respected throughout. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. The few "if the installed Waku version differs, adjust" notes are deliberate version-guards, not missing content.

**Type consistency:** `prefetch(state, fetchFn, params)` (Task 3) is called with matching argument order in Task 7. `HydrateSnapshot({ snapshot })` (Task 4) matches its call sites (Task 7). `RxfyProvider` takes only `children` (Task 4) and is used that way in `_layout.tsx` (Task 5). `DehydratedState` is the shared snapshot type across `ssr.ts`, `HydrateSnapshot`, and the pages.
```
