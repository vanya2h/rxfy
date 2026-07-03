# rxfy Framework Docs & Examples Reorganization — Design

**Date:** 2026-07-03
**Status:** Approved (pending spec review)

## Problem

PR #17 added three new packages — `rxfy-protocol`, `rxfy-server`, `rxfy-ws` — and a
full-stack live example, `vite-blog-framework`. The packages are undocumented, and the
docs have no place for them. Separately, the library's value proposition spans two very
different audiences:

1. Users who want **normalized reactive stores + model/data management** (client-only).
2. Users who want to build a **full live application** (client + SSR + real-time).

Today the docs present a single linear path and imply the full stack. New users can't
tell where the "just give me normalized state" story ends and the "build a live app"
story begins, and complexity is not introduced gradually.

## Goals

- Cover all three new packages (`rxfy-protocol`, `rxfy-server`, `rxfy-ws`).
- Let complexity grow step by step: **client-only → SSR → live**, so users try the
  library with minimal friction.
- Explicitly **fork the two audiences** early ("just normalized state" vs "full live app")
  so a new user chooses their own depth.
- Reorganize the sidebar to express this without a disruptive rewrite of existing
  reference pages.

## Non-goals

- No new example apps. The gradual story reuses existing examples as tier anchors.
- No restructuring of Core Concepts or existing React Bindings API pages.
- No SSR section rewrite. `/ssr` stays as-is (simplify only if a new API clearly reduces
  its boilerplate).

## Approach

### Learning spine — reuse existing examples as tiers

The gradual progression maps onto examples that already exist; the docs narrative
carries the continuity that the changing domains do not.

| Tier | Anchor example | Teaches |
|---|---|---|
| **1 · Store (client-only)** | `examples/vite-todo` | Normalized stores, Model/State, `useModelStore`/`useStateData`, mutations — no server |
| **2 · SSR** | `examples/vite-ssr-pagination` (Vite/Hono; closest stack to the live app), links out to `rr7-blog`, `next-blog`, `waku-blog` | dehydrate/hydrate, streaming, pagination |
| **3 · Live** | `examples/vite-blog-framework` | `rxfy-server`/`-protocol`/`-ws`, grants, patch/stale, live UI |

### The fork — "Choose your path"

`/getting-started` becomes a short intro that ends by forking into two quickstarts. This
fork is the "ask the user which cycle they want" mechanism.

- **Store quickstart** (`/getting-started/store`) — install `rxfy` + `rxfy-react`, wire a
  `vite-todo`-style store. Ends with: *"That's it — you have normalized reactive state.
  Need it on a server or live? Continue below."*
- **Framework quickstart** (`/getting-started/framework`) — install the full stack, stand
  up the `vite-blog-framework` skeleton.

Each quickstart footer links onward to the next tier so the paths converge rather than
dead-end. The Introduction page carries a one-line callout pointing at the fork (we do not
add a separate "Choose your path" landing page above Getting Started — it would wall off
the install steps).

### New "Framework" section (covers all 3 packages)

Concept-first, with per-package reference pages:

- **Overview** (`/framework`) — how live works end-to-end: patch vs stale, grants, the
  Drizzle → resource → model → store data flow. One diagram. Mental model before API.
- **rxfy-server** (`/framework/server`) — `defineResource`, `createResourceRegistry`,
  `createServer`, `live.create/update/delete`, `touch`, `live.grant`, `createTopicKeyer`.
  Largest page.
- **rxfy-protocol** (`/framework/protocol`) — the wire contract: patch/stale/subscribe/
  unsubscribe messages, codec, `PROTOCOL_VERSION`. Short; "you rarely touch this directly,
  but here's the contract."
- **rxfy-ws** (`/framework/ws`) — `createWsServer` / `createWsClient`, reconnection,
  plugging into any WS implementation. "The default transport; swap it for your own."
- **Grants & live hydration** (`/framework/grants`) — how SSR hands off to a live client
  (`live.grant` on the server, `readSsrGrants` on the client). The bridge between Tier 2
  and Tier 3. Cross-linked from `/ssr`.

The React glue (`createLiveClient`, `StoreProvider liveClient`, `readSsrGrants`,
`updatesAvailable$`) is documented under **React Bindings** (where it lives in code) and
cross-linked from the Framework section.

### Guide

- **Live blog** (`/guides/live-blog`) — end-to-end `vite-blog-framework` walkthrough:
  SSR grants → subscribe → patch applies live → stale shows the refresh badge.

### Replace the hand-rolled live guide

The existing `/guides/live-updates-websockets` teaches the pre-framework, hand-rolled
approach and explicitly claims *"rxfy ships no WebSocket helper"* — now false, since
`rxfy-ws` exists. It is the guide-twin of the deleted `vite-realtime-todos` example.

- Delete `/guides/live-updates-websockets`; `/guides/live-blog` is its replacement.
- Remove its sidebar entry.
- Salvage its "how it works underneath" explanation (topics, subscription set derived from
  the ids a client holds, patch-into-store) into the `/framework` overview page so the
  mental model is preserved.

### SSR

`/ssr` is kept as-is. During writing, evaluate whether any new helper reduces its
boilerplate; only then edit. Add a cross-link to `/framework/grants` for the live case.

### Comparison

Moved up in the sidebar to sit right after "Why rxfy?" (people compare before they
install). Content unchanged except an added "real-time" row.

### Remove `vite-realtime-todos`

It is a pre-framework, hand-rolled real-time example (Hono + Drizzle + WS, no
`rxfy-server`). It is now superseded by `vite-blog-framework` and no longer earns its
maintenance cost. Delete it and scrub live references.

Live references to remove (historical specs/plans under `docs/superpowers/` are left as
records):

- `examples/vite-realtime-todos/` (delete directory)
- `README.md` (remove listing)
- `apps/docs/src/pages/examples.mdx` (remove listing)
- `pnpm-lock.yaml` (regenerated by `pnpm install`)

## Final sidebar

```
Introduction
Why rxfy?
Comparison              ← moved up
Getting Started
  ├ Store quickstart
  └ Framework quickstart
Agent Skills

── Core Concepts ──      (unchanged)
── React Bindings ──     (+ live glue reference)

── Server-Side Rendering ──   (/ssr kept as-is)

── Framework (Real-time) ──   (new)
  Overview
  rxfy-server
  rxfy-protocol
  rxfy-ws
  Grants & live hydration

── Guides ──
  Todo app (client)
  Pagination & infinite scroll
  Live blog (new)

── Meta ──
  Examples · Changelog
```

## Content plan

**New pages (8):**
`getting-started/store`, `getting-started/framework`, `framework` (overview),
`framework/server`, `framework/protocol`, `framework/ws`, `framework/grants`,
`guides/live-blog`. Plus a live-glue reference page under React Bindings.

**Changed:**
- `getting-started` → intro + fork
- `examples.mdx` → regroup by tier; remove `vite-realtime-todos`
- `react` overview → mention live glue
- `comparison` → add a real-time row (and move its sidebar entry up)
- Introduction → one-line path callout
- `/ssr` → cross-link to `/framework/grants`; light simplification only if a new API allows
- `vocs.config.ts` → sidebar (move Comparison up; fork Getting Started; add Framework
  section; drop the "Live updates over WebSockets" entry; add "Live blog")
- `README.md` → packages table, links, examples (see Root README above)

**Deleted pages:**
`guides/live-updates-websockets.mdx` (replaced by `guides/live-blog`).

**Unchanged:**
All Core Concepts pages, existing React Bindings API pages, `why`, `agent-skills`,
`changelog`, Todo/Pagination guides, `/ssr` structure.

**Packages:**
Create a `README.md` for `rxfy-protocol`, `rxfy-server`, and `rxfy-ws`, and add
`"README.md"` to each package's `files` array (currently `dist,package.json`) so it ships.
The three are in a **`fixed` changeset group** with `rxfy`/`rxfy-react` (see
`.changeset/config.json`), so a single `pnpm changeset` (minor) covers all documentation of
their now-stable public API and versions the whole group in lockstep. Docs app is ignored by
changesets — no changeset for docs-page changes.

**Root `README.md`:**
- Packages table → add `rxfy-protocol`, `rxfy-server`, `rxfy-ws` rows.
- API Reference / Guides links → replace `live-updates-websockets` with `live-blog`;
  add a Framework link.
- Examples list → remove `vite-realtime-todos`; add `vite-blog-framework`.

**Repo:**
Delete `examples/vite-realtime-todos/`; run `pnpm install` to regenerate the lockfile.

## Implementation sequencing (3 waves)

1. **Scaffold & cleanup** — update `vocs.config.ts` sidebar (move Comparison, add Framework
   section, fork Getting Started, drop old live guide entry); delete `vite-realtime-todos`
   + `guides/live-updates-websockets.mdx` + scrub references in `README.md`/`examples.mdx`;
   create the 3 package READMEs (+ `files` array) and the changeset.
2. **Framework reference** — write `/framework` overview (incl. salvaged "under the hood"),
   `/framework/server`, `/framework/protocol`, `/framework/ws`, `/framework/grants`, and the
   React live-glue reference page.
3. **Narrative** — write the two quickstarts, `/guides/live-blog`, and update
   `examples.mdx` / `comparison` / Introduction / `/ssr` cross-links.

## Success criteria

- Every new package has a reference page reachable from the sidebar.
- A new user can complete the Store quickstart without ever touching server/SSR/live APIs.
- The Framework quickstart and Live blog guide take a user from install to a running
  live blog.
- No dangling references to `vite-realtime-todos`; `turbo build` and `turbo test` pass.
