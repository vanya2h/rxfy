# Docs restructure: progressive depth (store → +ssr → +sync)

**Date:** 2026-07-13
**Scope:** `apps/docs` only. Documentation prose and structure. **No published-code API changes.**

## Goal

Reorganize the docs around a single progressive-depth spine — **store → +SSR → +Sync Client** — instead
of the current two parallel "Store quickstart vs Framework quickstart" paths. The library is one unified
store whose live layer is opt-in; the docs should teach it as one ladder you climb as far as you need,
not two separate modes.

## Terminology change (docs prose only)

Rename the real-time capability/mode from "live" to **Sync Client** / **sync**. This is a
documentation-only rename — **no code identifier changes**.

- **RENAME** (user-facing concept, mode, section/guide/page titles describing the experience):
  - "the live path" / "live app" / "live mode" / "the framework path" → **Sync Client**
  - "live updates" / "going live" / "real-time updates" → **sync** / **real-time sync**
  - "Live blog" guide → **Sync blog**
  - "Live messages" reference page → **Sync messages**
- **KEEP verbatim** (code, packages, infra, URLs that name code): `createLiveClient`, `createLive`,
  `live.*` (`live.serve`, `live.update`, `live.hydration`, `live.renew`, …), `LiveClient`, the
  `rxfy-client` package name, the `/live` WebSocket path, example/template directory names
  (`vite-blog-framework`, `vite`, etc.). Reference prose that documents a code symbol keeps that symbol.

Naming alignment note: the mode is "Sync Client"; the constructor stays `createLiveClient`. Prose calls
the capability "sync" and the artifact "the Sync Client" while code snippets show `createLiveClient`
unchanged. This minor prose↔code gap is accepted (docs-only rename).

## New information architecture

### Getting Started index (`/getting-started`) — two-path chooser

Replaces the current store-vs-framework pros/cons list with two entry paths:

- **Path A — Add rxfy to an existing app.** You already have a React app; adopt rxfy incrementally.
  Routes into the three-guide ladder below; stop at any rung.
- **Path B — Start fresh with `create-rxfy-app`.** Scaffold a standalone app from a template. Indexes
  all three templates and how to run the scaffolder (moved out of today's framework quickstart).

### The three sequential guides (replace the two quickstarts)

```
Getting Started            /getting-started              (two-path chooser)
  ├ Create Store           /getting-started/create-store     (was /getting-started/store)
  ├ Add SSR                /getting-started/add-ssr          (new page)
  └ Add Sync Client        /getting-started/add-sync-client  (was /getting-started/framework)
```

Each guide ends by handing off to the next rung. Climbing is additive: SSR builds on the store, Sync
Client builds on SSR.

### Content sourcing per guide

- **Create Store** ← current `getting-started/store.mdx`. Retitle; rewrite the closing tip to point to
  _Add SSR_ instead of "the other path".
- **Add SSR** ← the how-to portions of `core-concepts/ssr.mdx` (`StoreProvider` `ssr`/`registry`/
  `dehydratedState` props, `dehydrate`/`hydrate`/`hydrationScript`, server + client render) — **SSR with
  no server push**. The `core-concepts/ssr.mdx` concept page stays for the "why"; the guide links to it.
- **Add Sync Client** ← current `getting-started/framework.mdx` **minus its scaffold section**
  (`createLive`, `defineResource`, ws server, writes, `createLiveClient`, grants + renewal, two-tabs
  demo), reframed with the sync terminology.
- The **scaffold section** at the top of today's `framework.mdx` **moves to index Path B**.

Net effect: today's overloaded `framework.mdx` (scaffold + SSR + server + ws + sync in one page) is
split across index Path B, Add SSR, and Add Sync Client.

### Path B template index

Rendered from the three bundled `create-rxfy-app` templates, each cross-linked to the rung it embodies:

| Template flag | Title                      | Rung it embodies                                       |
| ------------- | -------------------------- | ------------------------------------------------------ |
| `vite-spa`    | Vite (client-only SPA)     | Create Store — one model, one state, no server         |
| `next`        | Next.js (App Router)       | Add SSR — RSC prefetch + hydrate, isomorphic fetch     |
| `vite`        | Vite + Hono (live SSR app) | Add Sync Client — full stack, real-time over WebSocket |

Include `npm create rxfy-app@latest my-app`, the `-t/--template` non-interactive flag, and post-scaffold
steps (`cd`, install, `dev`).

## Unchanged sections

- **Core Concepts** (Normalization, Late Unwrapping, SSR) stay as explanatory pages. SSR concept page
  remains; the new _Add SSR_ guide is the task-oriented how-to that links to it.
- **API reference** (rxfy, React Bindings, rxfy-server, rxfy-ws) keeps its package organization and code
  symbol names. Only the "Live messages" page label → "Sync messages" and prose experience-terms change.
- **Tutorial Guides** (Todo app, Pagination) stay. "Live blog" guide → retitled **Sync blog** (file/slug
  `live-blog` → `sync-blog`; no redirect needed — see below).

## Sidebar changes (`apps/docs/vocs.config.ts`)

- Getting Started `items`: replace the two quickstart entries with the three guide entries above.
- Guides `items`: "Live blog" → "Sync blog" with updated link.
- rxfy-server `items`: "Live messages" → "Sync messages".

## Link + reference updates

- **No redirects.** The library has no external users yet; renamed slugs (`/store`, `/framework`,
  `/guides/live-blog`) just move, and all internal links are updated to match.
- Update every internal link to the old slugs. Known referrers to `getting-started/store` /
  `getting-started/framework`: `examples.mdx`, `comparison.mdx`, `index.mdx`, `getting-started.mdx`
  (plus the two quickstart files being replaced).
- Apply the terminology rename across all docs prose. `grep -ri` inventory of `live` spans ~33 pages;
  most are passing mentions of "live updates" → "sync". Reference pages under `framework/server` and
  `framework/ws` keep code symbols but update experience prose and the "Sync messages" title.
- `apps/docs/src/pages.gen.ts` is generated from the file tree — **regenerate it**, do not hand-edit.
- `agent-skills.mdx` and homepage `index.mdx`: update path names and the store/framework framing to the
  new store → +SSR → +Sync Client spine and two-path chooser.

## Out of scope

- Any change to published package code / APIs (`createLiveClient` etc. keep their names).
- The `.claude` agent skill files (`rxfy`, `rxfy-framework`) — separate follow-up if desired.
- Package restructuring (the earlier packaging assessment) — explicitly skipped.

## Success criteria

- `/getting-started` presents two paths (existing-app ladder, scaffold + template index).
- Three guide pages exist at the new slugs; `framework.mdx` is decomposed; no page is overloaded.
- No prose says "live path/mode/app/updates" as the user-facing term; code symbols unchanged.
- No dead internal links; `pages.gen.ts` regenerated; docs build passes.
