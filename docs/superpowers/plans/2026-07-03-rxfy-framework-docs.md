# rxfy Framework Docs & Examples Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Vocs docs to cover the three new packages (`rxfy-protocol`, `rxfy-server`, `rxfy-ws`), fork new users into a Store path vs a Framework path, tell a gradual client→SSR→live story over existing examples, and delete the superseded `vite-realtime-todos` example and its stale guide.

**Architecture:** Docs are a Vocs app (`apps/docs`, package name `docs`). Sidebar is a single array in `apps/docs/vocs.config.ts`; pages are MDX under `apps/docs/src/pages/`. The build (`pnpm --filter docs build`) statically renders every route and fails on unresolved internal links, so a clean build is the acceptance gate for each page task. No new example apps — the gradual story reuses `vite-todo` (client), `vite-ssr-pagination` (SSR), and `vite-blog-framework` (live) as tier anchors.

**Tech Stack:** Vocs 2 (React 19 + Vite + Waku), MDX, pnpm workspace, Turbo, Changesets. The live example stack (for accurate snippets) is Vite SSR + Hono + PGlite + Drizzle + `rxfy-server`/`rxfy-ws`.

**Source of truth for the design:** `docs/superpowers/specs/2026-07-03-rxfy-framework-docs-design.md`.

**Reference material for writing package/guide content** — read these before authoring the Framework pages and the Live blog guide:

- `packages/rxfy-server/src/{resource,resource-registry,server,state-channel,topic-key,hub}.ts`
- `packages/rxfy-protocol/src/{messages,codec}.ts`
- `packages/rxfy-ws/src/{server,client}.ts`
- `examples/vite-blog-framework/server/{live,ws,api}.ts`
- `examples/vite-blog-framework/src/blog/resources.ts`
- `examples/vite-blog-framework/src/{entry-server,entry-client}.tsx`

---

## Conventions for every task

- **Build check command:** `pnpm --filter docs build` — must exit 0. Vocs fails the build on a broken internal link, so this doubles as a link check.
- **Dev preview (optional while authoring):** `pnpm --filter docs dev` then open the changed route.
- Page frontmatter/title convention (match existing pages): first line is `# Title [Subtitle shown under the heading]`.
- File-reference links inside MDX use site-absolute paths (e.g. `/framework/server`), matching existing pages.
- Commit after each task with the message shown in its final step.

---

## WAVE 1 — Scaffold & cleanup

### Task 1: Delete the `vite-realtime-todos` example

**Files:**

- Delete: `examples/vite-realtime-todos/` (whole directory)

- [ ] **Step 1: Confirm the current reference set**

Run: `grep -rIl --exclude-dir=node_modules --exclude-dir=.git -e "vite-realtime-todos" -e "rxfy-example-realtime-todos" .`
Expected: `README.md`, `apps/docs/src/pages/examples.mdx`, `examples/vite-realtime-todos/*`, `pnpm-lock.yaml`, and historical files under `docs/superpowers/` (leave those historical ones alone).

- [ ] **Step 2: Delete the example directory**

Run: `git rm -r examples/vite-realtime-todos`
Expected: files staged for deletion.

- [ ] **Step 3: Regenerate the lockfile**

Run: `pnpm install`
Expected: `pnpm-lock.yaml` updates, no errors.

- [ ] **Step 4: Verify the workspace still builds**

Run: `pnpm turbo build --filter='!docs'`
Expected: PASS (docs excluded because its pages still reference the example until Task 3/4; those are fixed there).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(examples): remove vite-realtime-todos, superseded by vite-blog-framework"
```

---

### Task 2: Delete the stale hand-rolled live guide

**Files:**

- Delete: `apps/docs/src/pages/guides/live-updates-websockets.mdx`

> Its "how it works underneath" content (topics; the subscription set = the ids a client holds; patch-into-store) is salvaged into `/framework` in Task 6. Read it now and copy the two explanatory paragraphs into a scratch note for Task 6 before deleting.

- [ ] **Step 1: Salvage the mental-model paragraphs**

Run: `sed -n '1,60p' apps/docs/src/pages/guides/live-updates-websockets.mdx`
Save the "Normalization defines the subscription set…" explanation for reuse in Task 6. (Do not keep the hand-rolled server/client code — it is replaced by the framework.)

- [ ] **Step 2: Delete the page**

Run: `git rm apps/docs/src/pages/guides/live-updates-websockets.mdx`
Expected: staged for deletion. (Sidebar entry and README link are removed in Task 3.)

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: remove hand-rolled live-updates-websockets guide (replaced by framework)"
```

---

### Task 3: Rewrite the sidebar and scrub `README.md` references

**Files:**

- Modify: `apps/docs/vocs.config.ts:9-54`
- Modify: `README.md` (packages table ~28-31; links ~58-79)

- [ ] **Step 1: Replace the sidebar array**

In `apps/docs/vocs.config.ts`, replace the entire `sidebar: [ ... ]` (lines 9-54) with:

```ts
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Why rxfy?", link: "/why" },
    { text: "Comparison", link: "/comparison" },
    {
      text: "Getting Started",
      link: "/getting-started",
      items: [
        { text: "Store quickstart", link: "/getting-started/store" },
        { text: "Framework quickstart", link: "/getting-started/framework" },
      ],
    },
    { text: "Agent Skills", link: "/agent-skills" },
    { text: "Examples", link: "/examples" },
    { text: "Changelog", link: "/changelog" },

    {
      text: "Core Concepts",
      link: "/core-concepts",
      items: [
        { text: "Normalization", link: "/core-concepts/normalization" },
        { text: "Model", link: "/core-concepts/model" },
        { text: "State", link: "/core-concepts/state" },
        { text: "Atom", link: "/core-concepts/atom" },
        { text: "Lens", link: "/core-concepts/lens" },
      ],
    },

    {
      text: "React Bindings",
      link: "/react",
      items: [
        { text: "useStateData", link: "/react/use-state-data" },
        { text: "useStatePagedData", link: "/react/use-state-paged-data" },
        { text: "useModelStore", link: "/react/use-model-store" },
        { text: "useAtom", link: "/react/use-atom" },
        { text: "Pending", link: "/react/pending" },
        { text: "usePending", link: "/react/use-pending" },
        { text: "useObservable", link: "/react/use-observable" },
        { text: "Live client", link: "/react/live-client" },
      ],
    },

    { text: "Server-Side Rendering", link: "/ssr" },

    {
      text: "Framework (Real-time)",
      link: "/framework",
      items: [
        { text: "rxfy-server", link: "/framework/server" },
        { text: "rxfy-protocol", link: "/framework/protocol" },
        { text: "rxfy-ws", link: "/framework/ws" },
        { text: "Grants & live hydration", link: "/framework/grants" },
      ],
    },

    {
      text: "Guides",
      link: "/guides",
      items: [
        { text: "Build a Todo app", link: "/guides/todo-app" },
        { text: "Pagination and infinite scroll", link: "/guides/pagination" },
        { text: "Live blog", link: "/guides/live-blog" },
      ],
    },
  ],
```

- [ ] **Step 2: Update the `README.md` Packages table**

Replace the two-row table (lines ~28-31) with:

```markdown
| Package                                   | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| [`rxfy`](packages/rxfy)                   | Core library: Atom, Lens, Wrapped, Models/States API, SSR dehydrate/hydrate |
| [`rxfy-react`](packages/rxfy-react)       | Official React bindings (`rxfy-react/next` for Next.js App Router)          |
| [`rxfy-server`](packages/rxfy-server)     | Server-side live data: Drizzle resources, write + publish, grants           |
| [`rxfy-protocol`](packages/rxfy-protocol) | Wire protocol and codec for live updates                                    |
| [`rxfy-ws`](packages/rxfy-ws)             | Default WebSocket transport (client + server)                               |
```

- [ ] **Step 3: Fix `README.md` links and examples**

In the Guides link list, replace the `Live updates over WebSockets` line with:
`- [Live blog](https://rxfy.vanya2h.me/guides/live-blog)`

In the API Reference list, add after the SSR line:
`- [Framework (Real-time)](https://rxfy.vanya2h.me/framework)`

In the Examples list, remove the `vite-realtime-todos` bullet and add:
`- [vite-blog-framework](examples/vite-blog-framework) — live blog: SSR + WebSocket patches/stale, HMAC grants (Vite · Hono · PGlite · Drizzle · rxfy-server · rxfy-ws)`

- [ ] **Step 4: Build the docs**

Run: `pnpm --filter docs build`
Expected: FAIL — it now references not-yet-created pages (`/getting-started/store`, `/framework`, `/react/live-client`, `/guides/live-blog`, etc.). This is expected; those pages are created in later tasks. Confirm the ONLY errors are missing-page/link errors for the new routes, not syntax errors in the config.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/vocs.config.ts README.md
git commit -m "docs: restructure sidebar (fork Getting Started, add Framework section) and update README"
```

---

### Task 4: Regroup the Examples page by tier

**Files:**

- Modify: `apps/docs/src/pages/examples.mdx`

- [ ] **Step 1: Rewrite the page with tier headings**

Replace the whole file with a version organized by the three tiers. Keep the existing per-example descriptions verbatim for `vite-todo`, `vite-ssr-pagination`, `next-blog`, `rr7-blog`, `waku-blog`; **remove** the `vite-realtime-todos` section; **add** a `vite-blog-framework` section under a new "Live" tier. Use this structure:

````markdown
# Examples [Runnable apps, from client-only to fully live]

Runnable example apps in the [rxfy repository](https://github.com/vanya2h/rxfy/tree/main/examples), arranged the way the docs teach rxfy: start client-only, add SSR, then go live.

## Tier 1 · Client-only store

### vite-todo

<!-- keep existing vite-todo section body verbatim -->

## Tier 2 · Server-side rendering

### vite-ssr-pagination

<!-- keep existing body verbatim -->

### next-blog

<!-- keep existing body verbatim -->

### rr7-blog

<!-- keep existing body verbatim -->

### waku-blog

<!-- keep existing body verbatim -->

## Tier 3 · Live (the framework)

### vite-blog-framework

**[examples/vite-blog-framework](https://github.com/vanya2h/rxfy/tree/main/examples/vite-blog-framework)**

A live blog: server-rendered first paint, then real-time updates over WebSockets. Edits apply instantly across tabs (a `patch` on the entity topic); new posts/comments and deletes surface a "click to refresh" badge (a `stale` on the state channel). Built with Vite SSR · Hono · Hono WebSocket · PGlite (in-memory Postgres) · Drizzle · `rxfy-server` · `rxfy-ws`. SSR mints HMAC **grants** so a client may only subscribe to the topics on its page.

​```bash
pnpm --filter vite-blog-framework dev

# open in two tabs — edit a post in one, watch it change live in the other

​```

Companion guide: [Live blog](/guides/live-blog)
````

> Note: replace the `​` zero-width placeholders around the bash fence with a normal triple backtick fence when authoring — shown here only to nest inside this plan.

- [ ] **Step 2: Build**

Run: `pnpm --filter docs build`
Expected: still FAILs only on the not-yet-created pages from Task 3; the Examples page itself must not add new errors (its only new internal link, `/guides/live-blog`, is created in Task 12).

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/examples.mdx
git commit -m "docs: regroup Examples by tier; add vite-blog-framework, drop realtime-todos"
```

---

### Task 5: Create package READMEs and the changeset

**Files:**

- Create: `packages/rxfy-server/README.md`
- Create: `packages/rxfy-protocol/README.md`
- Create: `packages/rxfy-ws/README.md`
- Modify: `packages/rxfy-server/package.json` (`files` array)
- Modify: `packages/rxfy-protocol/package.json` (`files` array)
- Modify: `packages/rxfy-ws/package.json` (`files` array)
- Create: `.changeset/rxfy-live-framework.md`

- [ ] **Step 1: Write `packages/rxfy-server/README.md`**

````markdown
# rxfy-server

Server-side live data for [rxfy](https://rxfy.vanya2h.me). Bind [Drizzle](https://orm.drizzle.team) tables to rxfy models, write through the server, and publish live updates to subscribers.

## Install

​```bash
npm install rxfy-server

# peer deps: rxfy drizzle-orm drizzle-zod zod

​```

## What it gives you

- `defineResource` — bind a Drizzle table to an rxfy model.
- `createResourceRegistry` — a typed index of resources.
- `createServer` — `live.create` / `live.update` / `live.delete` that write to the DB and publish `patch` / `stale` messages.
- `createInMemoryHub` — pub/sub routing from topics to connections.
- `createTopicKeyer` — HMAC, time-windowed topic ids so clients cannot forge subscriptions.
- `live.grant` — mint the subscription grants a client is allowed to use (typically at SSR time).

See the [Framework docs](https://rxfy.vanya2h.me/framework) for the full walkthrough.
````

(Replace `​` with real backticks when authoring.)

- [ ] **Step 2: Write `packages/rxfy-protocol/README.md`**

```markdown
# rxfy-protocol

The wire protocol and codec for [rxfy](https://rxfy.vanya2h.me) live updates. You rarely import this directly — `rxfy-server` and `rxfy-ws` use it — but it defines the contract.

## Messages

- Server → client: `patch` (an entity changed), `stale` (a state channel was invalidated).
- Client → server: `subscribe` / `unsubscribe` (by topic id).

## Codec

- `serialize(message)` — encode to a string (via superjson, so `Date` etc. survive).
- `parseServerMessage(raw)` / `parseClientMessage(raw)` — validate and decode.
- `PROTOCOL_VERSION` — bumped on breaking wire changes.

See the [Framework docs](https://rxfy.vanya2h.me/framework/protocol).
```

- [ ] **Step 3: Write `packages/rxfy-ws/README.md`**

````markdown
# rxfy-ws

The default WebSocket transport for [rxfy](https://rxfy.vanya2h.me) live updates. Bridges a `rxfy-server` hub to WebSocket connections on the server, and rxfy stores to a socket on the client.

## Install

​```bash
npm install rxfy-ws

# server peer dep: rxfy-server, ws

​```

## API

- `createWsServer(hub)` — returns `{ handleConnection(socket) }`; wire it to your WS server's connection handler.
- `createWsClient({ url })` — returns a transport with `subscribe` / `unsubscribe` / `onMessage` / `close`, auto-reconnecting and re-subscribing.

Works with the Node `ws` package or the browser `WebSocket`. See the [Framework docs](https://rxfy.vanya2h.me/framework/ws).
````

- [ ] **Step 4: Add `README.md` to each package's `files` array**

In each of the three `package.json` files, change:
`"files": ["dist", "package.json"]`
to:
`"files": ["dist", "package.json", "README.md"]`

- [ ] **Step 5: Write the changeset**

Create `.changeset/rxfy-live-framework.md`:

```markdown
---
"rxfy-server": minor
"rxfy-protocol": minor
"rxfy-ws": minor
---

Document the live-update framework packages (rxfy-server, rxfy-protocol, rxfy-ws) and ship their READMEs.
```

> These three are in a `fixed` group with `rxfy`/`rxfy-react` (see `.changeset/config.json`), so `changeset version` will bump the whole group in lockstep — that is expected.

- [ ] **Step 6: Verify the changeset status parses**

Run: `pnpm changeset status`
Expected: lists the three packages (and their fixed-group peers) as bumped; no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-server/README.md packages/rxfy-protocol/README.md packages/rxfy-ws/README.md packages/rxfy-server/package.json packages/rxfy-protocol/package.json packages/rxfy-ws/package.json .changeset/rxfy-live-framework.md
git commit -m "docs(packages): add READMEs for rxfy-server, rxfy-protocol, rxfy-ws + changeset"
```

---

## WAVE 2 — Framework reference pages

> Each page in this wave is authored prose. The task fixes the page's path, title, required sections, and the exact API surface / code snippets that must appear (drawn from the reference files listed at the top). The build is the acceptance gate. Where a task says "snippet from X", copy the real, current code from that source file rather than inventing it.

### Task 6: `/framework` overview page

**Files:**

- Create: `apps/docs/src/pages/framework.mdx`

- [ ] **Step 1: Write the page**

Title: `# Framework (Real-time) [Server-driven live updates over normalized stores]`

Required sections:

1. **When you need this** — you have an rxfy app and want changes to appear live across clients without refetch. If you only need normalized client state, you do not need these packages (link back to `/getting-started/store`).
2. **The three packages** — one line each: `rxfy-server` (write + publish), `rxfy-protocol` (wire contract), `rxfy-ws` (transport). Link to each subpage.
3. **How it works underneath** — salvaged from the deleted guide (Task 2): every entity lives in one keyed cell, so a server push doesn't need to know who renders what; the subscription set is exactly the ids a client holds; a `patch` writes the new entity value into the store and every subscriber re-renders. Contrast `patch` (entity changed → applies silently) vs `stale` (a list/state channel changed → surfaces a refresh affordance).
4. **Data flow diagram** — a fenced ASCII diagram: `Drizzle table → defineResource → model → live.update → hub.publish(patch) → WS → client store → re-render`.
5. **Next** — link to `rxfy-server`, then the `/guides/live-blog` tutorial.

- [ ] **Step 2: Build**

Run: `pnpm --filter docs build`
Expected: `/framework` resolves; remaining failures are only the still-missing subpages.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/framework.mdx
git commit -m "docs(framework): add overview page"
```

---

### Task 7: `/framework/server` — rxfy-server reference

**Files:**

- Create: `apps/docs/src/pages/framework/server.mdx`

- [ ] **Step 1: Write the page**

Title: `# rxfy-server [Bind Drizzle tables, write, and publish live updates]`

Required sections, each with a real snippet from the reference files:

1. **defineResource** — from `examples/vite-blog-framework/src/blog/resources.ts`: `defineResource({ table, model })` and `createResourceRegistry([...])`. Explain `name`/`getKey`/`primaryKeyColumn` derivation and the composite-key limitation (v1: single PK only, per `packages/rxfy-server/src/resource.ts`).
2. **createServer** — from `examples/vite-blog-framework/server/live.ts`: `createServer({ db, resources, hub, keyer })` returning `live`.
3. **Writes** — `live.create` / `live.update` / `live.delete` and the `{ touch: [...] }` option, from `examples/vite-blog-framework/server/api.ts`. Explain: `update` auto-publishes a `patch` on the entity topic; `create`/`delete` publish `stale` on the state channels you `touch`.
4. **createTopicKeyer** — from `packages/rxfy-server/src/topic-key.ts`: `createTopicKeyer({ secret, windowMs })`, why ids are time-windowed HMACs, and that publish covers current+previous windows.
5. **live.grant** — brief; forward-link to `/framework/grants`.
6. **createInMemoryHub** — one paragraph; the hub is pub/sub routing; forward-link to `/framework/ws` for delivery.

- [ ] **Step 2: Build**

Run: `pnpm --filter docs build`
Expected: `/framework/server` resolves.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/framework/server.mdx
git commit -m "docs(framework): add rxfy-server reference"
```

---

### Task 8: `/framework/protocol` — rxfy-protocol reference

**Files:**

- Create: `apps/docs/src/pages/framework/protocol.mdx`

- [ ] **Step 1: Write the page**

Title: `# rxfy-protocol [The wire contract for live updates]`

Required sections (source: `packages/rxfy-protocol/src/messages.ts` and `codec.ts`):

1. **You rarely import this** — `rxfy-server` and `rxfy-ws` use it; documented so custom transports/servers can conform.
2. **Messages** — a table of the four message kinds with their fields: `patch { v, kind, name, id, data }`, `stale { v, kind, channel }`, `subscribe { v, kind, ids }`, `unsubscribe { v, kind, ids }`. Note the server→client vs client→server direction.
3. **Codec** — `serialize`, `parseServerMessage`, `parseClientMessage`, `ProtocolError`, `PROTOCOL_VERSION`; note superjson (so `Date` survives).
4. **Versioning** — `PROTOCOL_VERSION` and what a bump means.

- [ ] **Step 2: Build**

Run: `pnpm --filter docs build`
Expected: `/framework/protocol` resolves.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/framework/protocol.mdx
git commit -m "docs(framework): add rxfy-protocol reference"
```

---

### Task 9: `/framework/ws` — rxfy-ws reference

**Files:**

- Create: `apps/docs/src/pages/framework/ws.mdx`

- [ ] **Step 1: Write the page**

Title: `# rxfy-ws [The default WebSocket transport]`

Required sections (source: `packages/rxfy-ws/src/{server,client}.ts` and `examples/vite-blog-framework/server/ws.ts`, `src/entry-client.tsx`):

1. **Server** — `createWsServer(hub)` → `{ handleConnection(socket) }`; the `ServerSocket` shape (`send`, `on`); the Hono-WS bridge example from `server/ws.ts`.
2. **Client** — `createWsClient({ url, WebSocketImpl?, reconnectDelayMs? })` → `{ subscribe, unsubscribe, onMessage, close }`; auto-reconnect and re-subscribe behavior.
3. **Bring your own transport** — the client only needs a `WebSocketLike`; the transport is swappable (forward-link to `/framework/protocol` for the contract a custom transport must honor).

- [ ] **Step 2: Build**

Run: `pnpm --filter docs build`
Expected: `/framework/ws` resolves.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/framework/ws.mdx
git commit -m "docs(framework): add rxfy-ws reference"
```

---

### Task 10: `/framework/grants` — grants & live hydration

**Files:**

- Create: `apps/docs/src/pages/framework/grants.mdx`
- Modify: `apps/docs/src/pages/ssr.mdx` (add one cross-link)

- [ ] **Step 1: Write the grants page**

Title: `# Grants & live hydration [Hand off an SSR render to a live client]`

Required sections (source: `examples/vite-blog-framework/src/{entry-server,entry-client}.tsx`, `packages/rxfy-server/src/{server,state-channel}.ts`):

1. **The problem** — a client may only subscribe to topics it is allowed to. Grants are the server's minted allow-list.
2. **On the server** — `live.grant(registry, { entities, states })` at `onAllReady`, then `hydrationScript({ ...dehydrate(registry), grants })` (snippet from `entry-server.tsx`).
3. **On the client** — `readSsrGrants()` + `createLiveClient({ registry, transport, grants })` + `<StoreProvider registry ssr liveClient>` (snippet from `entry-client.tsx`). Forward-link `createLiveClient` details to `/react/live-client`.
4. **State channels** — `invalidationChannel` / `StateChannelDescriptor` are deterministic on client and server (from `state-channel.ts`); this is why a `stale` on `posts` maps to the right page.

- [ ] **Step 2: Add the SSR cross-link**

In `apps/docs/src/pages/ssr.mdx`, add a short callout near the top (after the intro `:::info[Requirements]` block):

```markdown
:::tip[Building a live app?]
SSR also mints the subscription **grants** a live client uses. See
[Grants & live hydration](/framework/grants).
:::
```

> Do not otherwise restructure `ssr.mdx`. (If, while reading it, a new helper clearly collapses existing boilerplate, note it for a follow-up — do not refactor here.)

- [ ] **Step 3: Build**

Run: `pnpm --filter docs build`
Expected: `/framework/grants` resolves; `ssr` still builds.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages/framework/grants.mdx apps/docs/src/pages/ssr.mdx
git commit -m "docs(framework): add grants & live hydration; link from SSR"
```

---

### Task 11: `/react/live-client` — React live glue reference

**Files:**

- Create: `apps/docs/src/pages/react/live-client.mdx`
- Modify: `apps/docs/src/pages/react.mdx` (add a bullet)

> First confirm the exact exports and their signatures. Run:
> `grep -rn "createLiveClient\|updatesAvailable\|readSsrGrants\|liveClient" packages/rxfy-react/src | head -40`
> and read the definitions before authoring, so the reference matches the real API.

- [ ] **Step 1: Write the page**

Title: `# Live client [Wire a WebSocket transport into StoreProvider]`

Required sections (source: `packages/rxfy-react/src` per the grep, and `examples/vite-blog-framework/src/entry-client.tsx`):

1. **createLiveClient** — `createLiveClient({ registry, transport, grants })`; what it subscribes to and how patches reach the store.
2. **StoreProvider `liveClient` prop** — passing the live client into the provider.
3. **updatesAvailable$** — how a component reads the "N new — click to refresh" signal and calls the refresh/apply action (as used in the blog).
4. **readSsrGrants** — reading grants injected by the hydration script; forward-link to `/framework/grants`.

- [ ] **Step 2: Add the React overview bullet**

In `apps/docs/src/pages/react.mdx`, add to the hook list (after `useObservable`):

```markdown
- [`createLiveClient` / live client](/react/live-client) — connect a WebSocket transport so
  server pushes land in the store; exposes `updatesAvailable$` for refresh affordances. Used
  by the [Framework](/framework).
```

- [ ] **Step 3: Build**

Run: `pnpm --filter docs build`
Expected: `/react/live-client` resolves.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages/react/live-client.mdx apps/docs/src/pages/react.mdx
git commit -m "docs(react): add live client reference"
```

---

## WAVE 3 — Narrative: quickstarts, guide, and cross-links

### Task 12: `/guides/live-blog` tutorial

**Files:**

- Create: `apps/docs/src/pages/guides/live-blog.mdx`

- [ ] **Step 1: Write the guide**

Title: `# Live blog [Build a real-time blog: SSR, then live patches and stale badges]`

A walkthrough of `vite-blog-framework`, in the order a reader builds it. Required sections, each grounded in the example's real files:

1. **What you'll build** — one screenshot-in-words: edits apply live across tabs; new posts/comments show a refresh badge.
2. **Define resources** — `src/blog/resources.ts` (`defineResource`, `createResourceRegistry`).
3. **Stand up the live server** — `server/live.ts` (`createInMemoryHub`, `createTopicKeyer`, `createServer`).
4. **Wire the socket** — `server/ws.ts` (`createWsServer` + Hono WS bridge).
5. **Write through the server** — `server/api.ts` (`live.create/update/delete`, `touch`).
6. **SSR with grants** — `src/entry-server.tsx` (`live.grant`, `hydrationScript`); link to `/framework/grants`.
7. **Hydrate + go live** — `src/entry-client.tsx` (`createWsClient`, `createLiveClient`, `readSsrGrants`, `StoreProvider liveClient`); link to `/react/live-client`.
8. **See it live** — the two-tab test; explain which action produces a `patch` (edit) vs a `stale` (create/delete).
9. **Run it** — `pnpm --filter vite-blog-framework dev`.

- [ ] **Step 2: Build**

Run: `pnpm --filter docs build`
Expected: `/guides/live-blog` resolves; the Examples page link (Task 4) now also resolves.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/guides/live-blog.mdx
git commit -m "docs(guides): add live blog tutorial"
```

---

### Task 13: Fork Getting Started into intro + two quickstarts

**Files:**

- Modify: `apps/docs/src/pages/getting-started.mdx` (becomes the intro + fork hub)
- Create: `apps/docs/src/pages/getting-started/store.mdx`
- Create: `apps/docs/src/pages/getting-started/framework.mdx`

- [ ] **Step 1: Trim `getting-started.mdx` into an intro + fork**

Keep the existing **Agent skills** section. Replace the Install/Wrap/Next-steps body with a short "Two ways to start" fork. After the Agent-skills section, the body becomes:

```markdown
## Two ways to start

rxfy scales from a client-only store to a fully live app. Pick where you are:

:::steps

### Just normalized state?

You want typed, normalized, reactive stores in a React app — no server required.
→ **[Store quickstart](/getting-started/store)**

### Building a live app?

You want server-side rendering and real-time updates across clients.
→ **[Framework quickstart](/getting-started/framework)**

:::

Both paths converge: the Store quickstart links onward to SSR and the Framework when you need them.
```

> Verify `:::steps` is a supported Vocs directive during authoring; if not, use a plain `##`/list layout. The build will error if the directive is unknown.

- [ ] **Step 2: Write `getting-started/store.mdx`**

Title: `# Store quickstart [Normalized reactive state in a client-only app]`

Move the current **Install** (rxfy + rxfy-react + peer deps) and **Wrap your app** (client-only `StoreProvider`) content from the old getting-started here. End with:

```markdown
## Next steps

Start with the [Tutorial: Build a Todo app](/guides/todo-app) — the [`vite-todo`](/examples) example.

That's it — you have normalized reactive state. Need it on a server or live?

- Add server rendering → [Server-Side Rendering](/ssr)
- Go real-time → [Framework quickstart](/getting-started/framework)
```

- [ ] **Step 3: Write `getting-started/framework.mdx`**

Title: `# Framework quickstart [Install the full stack for a live app]`

Sections:

1. **Install** — `rxfy rxfy-react rxfy-server rxfy-ws` plus peer deps (`rxjs zod lodash drizzle-orm drizzle-zod`), using the `:::code-group` npm/pnpm/yarn/bun pattern from the old getting-started.
2. **The shape of a live app** — three bullets linking the pieces: resources + server (`/framework/server`), transport (`/framework/ws`), SSR grants (`/framework/grants`).
3. **Follow the tutorial** — link to [`/guides/live-blog`] as the end-to-end build, backed by the [`vite-blog-framework`](/examples) example.
4. **New to rxfy?** — callout: if you have not used the core store yet, do the [Store quickstart](/getting-started/store) first.

- [ ] **Step 4: Build**

Run: `pnpm --filter docs build`
Expected: PASS — all internal links now resolve (this is the first task where the whole graph is complete). If any link errors remain, they name the offending route; fix before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/src/pages/getting-started.mdx apps/docs/src/pages/getting-started/store.mdx apps/docs/src/pages/getting-started/framework.mdx
git commit -m "docs: fork Getting Started into Store and Framework quickstarts"
```

---

### Task 14: Introduction callout + Comparison real-time row

**Files:**

- Modify: `apps/docs/src/pages/index.mdx` (one-line path callout)
- Modify: `apps/docs/src/pages/comparison.mdx` (table row + prose)

- [ ] **Step 1: Add the Introduction path callout**

Read `apps/docs/src/pages/index.mdx` first. After its opening/quick-taste section, add:

```markdown
:::tip[Choose your path]
Just want normalized reactive state? → [Store quickstart](/getting-started/store).
Building a live app with SSR and real-time updates? → [Framework quickstart](/getting-started/framework).
:::
```

- [ ] **Step 2: Add a real-time row to the comparison table**

In `apps/docs/src/pages/comparison.mdx`, add a row to the "At a glance" table (after the `SSR` row):

```markdown
| **Real-time** | ✅ live framework | ➖ manual | ❌ | ➖ manual | ➖ manual |
```

And add one sentence to the intro paragraph noting that rxfy offers a first-party live-update framework (`rxfy-server`/`-ws`), linking `/framework`.

- [ ] **Step 3: Build**

Run: `pnpm --filter docs build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages/index.mdx apps/docs/src/pages/comparison.mdx
git commit -m "docs: add path callout on intro and real-time row in comparison"
```

---

### Task 15: Final full-repo verification

**Files:** none (verification only)

- [ ] **Step 1: Full docs build**

Run: `pnpm --filter docs build`
Expected: PASS, zero broken-link errors.

- [ ] **Step 2: No dangling references to removed items**

Run: `grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs -e "vite-realtime-todos" -e "live-updates-websockets" apps README.md`
Expected: no matches (the only remaining hits, if any, are historical files under `docs/superpowers/`, which are intentionally left as records).

- [ ] **Step 3: Whole-repo build and test**

Run: `pnpm turbo build && pnpm turbo test`
Expected: PASS (confirms the example deletion and package `files`/README changes did not break anything).

- [ ] **Step 4: Changeset still valid**

Run: `pnpm changeset status`
Expected: the three framework packages (and fixed-group peers) listed; no errors.

- [ ] **Step 5: Commit any final fixups**

```bash
git commit -am "docs: final verification fixups" --allow-empty
```

---

## Self-review notes (author checked against the spec)

- **Every spec deliverable maps to a task:** sidebar reorg → T3; Store/Framework fork → T13; Framework section (overview + 3 packages + grants) → T6–T10; live-glue reference → T11; live-blog guide → T12; SSR kept-as-is + cross-link → T10; Comparison moved (T3) + real-time row (T14); Examples regroup → T4; delete `vite-realtime-todos` → T1; delete stale guide + salvage → T2/T6; package READMEs + `files` + changeset → T5; README scrub → T3.
- **Naming consistency:** routes match the sidebar in T3 exactly (`/getting-started/store`, `/getting-started/framework`, `/framework`, `/framework/server`, `/framework/protocol`, `/framework/ws`, `/framework/grants`, `/react/live-client`, `/guides/live-blog`).
- **Build-as-test:** the docs build fails on broken internal links, so intermediate tasks (T3–T11) will show expected link failures for not-yet-created routes; T13 Step 4 is the first fully-green build, and T15 is the final gate.
- **API accuracy guard:** T7–T12 require reading the real source/example files before authoring, and T11 requires a grep to confirm the `rxfy-react` live exports, so no page invents an API.
