# Docs Progressive-Depth Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps/docs` around a single progressive-depth spine — **Create Store → Add SSR → Add Sync Client** — with a two-path Getting Started index, and rename the user-facing "live" terminology to "Sync Client"/"sync" in prose only.

**Architecture:** Pure documentation change in `apps/docs/src/pages` plus the sidebar in `apps/docs/vocs.config.ts`. Replace the two quickstarts (`store.mdx`, `framework.mdx`) with three sequential guides; move the scaffolder content into the Getting Started index as "Path B"; sweep prose terminology. No published-package code changes — code symbols (`createLiveClient`, `createLive`, `live.*`, `LiveClient`, `rxfy-client`, `/live`) stay verbatim.

**Tech Stack:** Vocs (docs framework) with Waku router; MDX pages; `pnpm`/Turbo monorepo. Verification is by grep assertions + `vocs build` (docs have no unit tests; the build is the compile/link check).

**Spec:** `docs/superpowers/specs/2026-07-13-docs-progressive-depth-restructure-design.md`

**Conventions for every task below:**

- Prettier runs on commit via husky/lint-staged (120 width, double quotes) — do not fight it; let it reformat.
- Do NOT add a `Co-Authored-By` trailer to commits (repo convention).
- "Verify" steps replace TDD tests: run the exact grep/build command and confirm the stated expected output before committing.

---

### Task 1: Rename the Store quickstart → "Create Store" guide

**Files:**

- Rename: `apps/docs/src/pages/getting-started/store.mdx` → `apps/docs/src/pages/getting-started/create-store.mdx`
- Modify: the new file's title line and closing tip

- [ ] **Step 1: Git-rename the file**

```bash
cd /Users/vanya2h/Repos/rxfy
git mv apps/docs/src/pages/getting-started/store.mdx apps/docs/src/pages/getting-started/create-store.mdx
```

- [ ] **Step 2: Retitle the page**

In `apps/docs/src/pages/getting-started/create-store.mdx`, replace line 1:

```
# Store quickstart [Normalized reactive state in a client-only app]
```

with:

```
# Create Store [Normalized reactive state in a client-only app]
```

- [ ] **Step 3: Rewrite the closing tip to hand off to the next rung**

In the same file, replace the final `:::tip … :::` block (currently the block starting "Starting a new real-time app instead?") with:

```mdx
:::tip[Next rung: SSR]
Your store works on the client. The next step up the ladder is
[Add SSR](/getting-started/add-ssr): render the first paint on the server and hydrate it
with no refetch — same models, same components, no server push yet. After that,
[Add Sync Client](/getting-started/add-sync-client) turns on real-time sync.
:::
```

- [ ] **Step 4: Verify the page renames and reads correctly**

```bash
cd /Users/vanya2h/Repos/rxfy
test -f apps/docs/src/pages/getting-started/create-store.mdx && echo "RENAMED_OK"
grep -n "^# Create Store" apps/docs/src/pages/getting-started/create-store.mdx
grep -c "getting-started/add-ssr" apps/docs/src/pages/getting-started/create-store.mdx
```

Expected: prints `RENAMED_OK`, the retitled heading, and `1`.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/src/pages/getting-started/
git commit -m "docs(getting-started): rename Store quickstart to Create Store guide"
```

---

### Task 2: Create the "Add SSR" guide

**Files:**

- Create: `apps/docs/src/pages/getting-started/add-ssr.mdx`
- Reference (unchanged): `apps/docs/src/pages/core-concepts/ssr.mdx` (stays as the concept "why" page)

**Note:** This guide is the task-oriented how-to (buffered SSR wired end to end), **SSR with no server push**. It reuses the buffered-mode code from `core-concepts/ssr.mdx:32-104`. The concept page keeps the deep-dive (two-pass, streaming, helpers, error handling); the guide links to it.

- [ ] **Step 1: Write the new guide file**

Create `apps/docs/src/pages/getting-started/add-ssr.mdx` with this exact content:

````mdx
# Add SSR [Render the first paint on the server, hydrate with no refetch]

This is the second rung of the ladder. You have a working store from
[Create Store](/getting-started/create-store); now render it on the server so the first
paint arrives already fulfilled — no loading flash, no refetch, no hydration mismatch. There
is still **no server yet pushing updates**; that is the next rung,
[Add Sync Client](/getting-started/add-sync-client).

Nothing in your components changes. They declare data with `useStateData` exactly as before;
on the server a cache miss suspends until the fetch settles, the result is captured in the
registry, serialized into the HTML, and ingested on the client.

:::info[Requirements]
Models carry a `name` and states a `key` (both required by their types), and `fetchFn` must
run in **both** environments — it fetches on the server during SSR and on the client for
reloads. See [Server-Side Rendering](/core-concepts/ssr) for the full requirements.
:::

## Render on the server

`onAllReady` waits for every Suspense boundary, then you dehydrate the now-complete registry
into a snapshot and return it alongside the HTML. One registry per request — never shared:

```tsx [entry-server.tsx]
import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { App } from "./App";

export function render(url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry(); // one registry per request — never shared

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <Suspense fallback={null}>
            <App url={url} />
          </Suspense>
        </StoreProvider>
      </StrictMode>,
      {
        // Fires once every fetch has settled and the registry is fully populated.
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            resolve({ html, state: hydrationScript(dehydrate(registry)) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
}
```

## Inject the snapshot

Your HTTP handler drops the rendered markup and the dehydrated `<script>` into an
`index.html` template with two placeholders:

```ts [server.ts]
import { readFileSync } from "node:fs";
import { render } from "./entry-server";

// index.html carries two placeholders: <!--app-html--> and <!--app-state-->
const template = readFileSync("./index.html", "utf-8");

// Express / Hono / plain node:http — whatever serves your HTML.
app.get("*", async (req, res) => {
  const { html, state } = await render(req.url);
  const page = template
    .replace("<!--app-html-->", html) // the rendered markup
    .replace("<!--app-state-->", state); // the hydrationScript <script> tag
  res.status(200).setHeader("Content-Type", "text/html").end(page);
});
```

## Hydrate on the client

The injected `<script>` populated `window.__RXFY_SSR__`; `StoreProvider ssr` ingests it, so
the first paint is already fulfilled:

```tsx [client.tsx]
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import { App } from "./App";

hydrateRoot(
  document.getElementById("root")!,
  <StoreProvider ssr>
    <App url={window.location.pathname} />
  </StoreProvider>,
);
```

Reload the page with the network throttled: the content is in the initial HTML, and the
client hydrates it without a second fetch.

## Next steps

- [Server-Side Rendering](/core-concepts/ssr): the concept in full — two-pass mode for strict
  `renderToString`, streaming mode for Next.js App Router, the `dehydrate`/`hydrate`/
  `hydrationScript` helpers, and error handling.
- [Add Sync Client](/getting-started/add-sync-client): the third rung — a server that writes
  and publishes, and a client that subscribes and applies real-time updates.
````

- [ ] **Step 2: Verify the guide compiles and links correctly**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -n "^# Add SSR" apps/docs/src/pages/getting-started/add-ssr.mdx
grep -c "getting-started/add-sync-client" apps/docs/src/pages/getting-started/add-ssr.mdx
grep -c "core-concepts/ssr" apps/docs/src/pages/getting-started/add-ssr.mdx
```

Expected: the heading, `2` (two links to add-sync-client), and `2` (two links to the concept page).

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/getting-started/add-ssr.mdx
git commit -m "docs(getting-started): add the Add SSR guide (SSR rung, no server push)"
```

---

### Task 3: Split the Framework quickstart → "Add Sync Client" guide

**Files:**

- Rename: `apps/docs/src/pages/getting-started/framework.mdx` → `apps/docs/src/pages/getting-started/add-sync-client.mdx`
- Modify: remove the scaffold section (moves to the index in Task 4), retitle, apply sync terminology
- Scratch: save the removed scaffold section text for Task 4

**Note:** The current `framework.mdx` has a "## Scaffold a new app" section (lines ~22-53). That content moves to the Getting Started index "Path B" in Task 4. Here we remove it from this page and reframe the rest as "Add Sync Client".

- [ ] **Step 1: Git-rename the file**

```bash
cd /Users/vanya2h/Repos/rxfy
git mv apps/docs/src/pages/getting-started/framework.mdx apps/docs/src/pages/getting-started/add-sync-client.mdx
```

- [ ] **Step 2: Save the scaffold section for Task 4**

Copy the entire `## Scaffold a new app` section (from that heading down to just before `## Install`) out of `add-sync-client.mdx` into a scratch file so Task 4 can reuse it verbatim:

```bash
mkdir -p /private/tmp/claude-501/-Users-vanya2h-Repos-rxfy/5af8b98c-7b00-403e-bd2b-c1317908284d/scratchpad
```

Then, using the editor, cut the `## Scaffold a new app` … (through the `pnpm dev` block and its trailing "Open http://localhost:3000 …" paragraph) into `…/scratchpad/scaffold-section.md`. Leave the rest of the page intact.

- [ ] **Step 3: Retitle and rewrite the intro**

Replace line 1 of `add-sync-client.mdx`:

```
# Framework quickstart [The full stack for a live app]
```

with:

```
# Add Sync Client [The full stack: the server publishes, the client syncs]
```

Then replace the opening paragraph (the "The framework path puts the same normalized store…" paragraph) with:

```mdx
This is the third rung of the ladder. On top of your [store](/getting-started/create-store)
and [SSR](/getting-started/add-ssr), a **Sync Client** keeps every connected browser in
sync in real time. The server owns writes: it applies a change, then publishes the new
entity value automatically; every client writes that value into its shared store, and every
component subscribed to that entity re-renders. Same store, same components — nothing in
`useStateData` or `useModelStore` is sync-aware — the write just arrives over the wire
instead of from a local call.

This page wires the whole loop: the server, the socket, writes, and the browser Sync Client,
then watches an edit land in another tab. Prefer to start from a working app? Scaffold one
with [`create-rxfy-app`](/getting-started) (the `vite` template is this exact stack).
```

- [ ] **Step 4: Apply the sync terminology across this page (prose only)**

Within `add-sync-client.mdx`, apply these prose replacements. **Do not touch code blocks or code identifiers** (`createLive`, `live.update`, `createLiveClient`, `LiveClient`, `/live`, `rxfy-client` stay verbatim):

| Find (prose)                                                                               | Replace                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------- |
| "the framework path" / "The framework path"                                                | "the Sync Client" / "The Sync Client" |
| "a live app" / "live app"                                                                  | "a synced app" / "synced app"         |
| "live updates"                                                                             | "real-time sync"                      |
| "Go live on the client" (heading)                                                          | "Add the Sync Client"                 |
| "going live"                                                                               | "adding sync"                         |
| the `:::note[Is this path for you?]` body mention of "the live stack"                      | "the sync stack"                      |
| closing `:::tip` "Not ready for a server?" — keep, but "the live stack" → "the sync stack" |

Keep every reference to the **`rxfy-client`** package name and the phrase "browser live runtime" may become "browser sync runtime" in prose (it is prose, not a symbol).

- [ ] **Step 5: Verify no scaffold section remains and terminology applied**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -c "Scaffold a new app" apps/docs/src/pages/getting-started/add-sync-client.mdx
grep -c "npm create rxfy-app" apps/docs/src/pages/getting-started/add-sync-client.mdx
grep -n "^# Add Sync Client" apps/docs/src/pages/getting-started/add-sync-client.mdx
grep -c "createLiveClient" apps/docs/src/pages/getting-started/add-sync-client.mdx
```

Expected: `0` (scaffold heading gone), `0` (scaffold command gone), the retitled heading, and a non-zero count for `createLiveClient` (code symbol preserved).

- [ ] **Step 6: Commit**

```bash
git add apps/docs/src/pages/getting-started/add-sync-client.mdx
git commit -m "docs(getting-started): split Framework quickstart into Add Sync Client guide"
```

---

### Task 4: Rewrite the Getting Started index as a two-path chooser + template index

**Files:**

- Modify (full rewrite): `apps/docs/src/pages/getting-started.mdx`
- Reference: `…/scratchpad/scaffold-section.md` (from Task 3), `packages/create-rxfy-app/dist/templates/*/template.json`

- [ ] **Step 1: Replace the whole file**

Overwrite `apps/docs/src/pages/getting-started.mdx` with this exact content:

````mdx
# Getting Started

rxfy is one store that scales with you. Start client-only, then climb the ladder as far as
your app needs: **Create Store → Add SSR → Add Sync Client**. Each rung is additive — the
store you build in the first guide is the same store SSR renders and the Sync Client keeps
live. Pick where you are:

## Path A — Add rxfy to an existing app

You already have a React app. Adopt rxfy incrementally and stop at any rung:

1. **[Create Store](/getting-started/create-store)** — typed models, normalized entities, and
   reactive subscriptions on the client. Two packages (`rxfy`, `rxfy-react`), no server.
2. **[Add SSR](/getting-started/add-ssr)** — render the first paint on the server and hydrate
   it with no refetch. Still no server push.
3. **[Add Sync Client](/getting-started/add-sync-client)** — a server that writes and
   publishes, and a browser Sync Client that subscribes and applies real-time updates.

## Path B — Start fresh with `create-rxfy-app`

Scaffold a standalone app from an official template. Each template lands you on one rung of
the ladder, wired end to end:

:::code-group

```bash [npm]
npm create rxfy-app@latest my-app
```

```bash [pnpm]
pnpm create rxfy-app my-app
```

```bash [yarn]
yarn create rxfy-app my-app
```

:::

Then:

```bash
cd my-app
pnpm install
pnpm dev
```

Pass `--template` (`-t`) to skip the interactive picker:

```bash
npm create rxfy-app@latest my-app -- --template vite-spa
```

### Templates

| Template (`-t`) | Stack                                                                                                   | Rung                |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| `vite-spa`      | Vite (client-only SPA) — one model, one state, `useStateData`, no server                                | **Create Store**    |
| `next`          | Next.js (App Router) — SSR store via RSC prefetch + hydrate, isomorphic fetch, server actions           | **Add SSR**         |
| `vite`          | Vite + Hono — full sync stack: Vite SSR, React Router, Hono, Drizzle + PGlite, real-time over WebSocket | **Add Sync Client** |

The `vite` template scaffolds the whole loop the [Add Sync Client](/getting-started/add-sync-client)
guide builds by hand — open http://localhost:3000 in two tabs and toggle a todo; the other
tab updates instantly.
````

- [ ] **Step 2: Verify the index has both paths and all three templates**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -c "Path A — Add rxfy to an existing app" apps/docs/src/pages/getting-started.mdx
grep -c "Path B — Start fresh" apps/docs/src/pages/getting-started.mdx
for t in vite-spa next vite; do grep -q "\`$t\`" apps/docs/src/pages/getting-started.mdx && echo "template $t OK"; done
grep -Ec "getting-started/store|getting-started/framework" apps/docs/src/pages/getting-started.mdx
```

Expected: `1`, `1`, three "template … OK" lines, and `0` (no links to the old slugs).

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/getting-started.mdx
git commit -m "docs(getting-started): two-path index with create-rxfy-app template map"
```

---

### Task 5: Update the sidebar in `vocs.config.ts`

**Files:**

- Modify: `apps/docs/vocs.config.ts:22-29` (Getting Started items), `:74` (Live messages label), `:92-98` (Guides items)

- [ ] **Step 1: Replace the Getting Started items**

In `apps/docs/vocs.config.ts`, replace the Getting Started `items` block:

```ts
      items: [
        { text: "Store quickstart", link: "/getting-started/store" },
        { text: "Framework quickstart", link: "/getting-started/framework" },
      ],
```

with:

```ts
      items: [
        { text: "Create Store", link: "/getting-started/create-store" },
        { text: "Add SSR", link: "/getting-started/add-ssr" },
        { text: "Add Sync Client", link: "/getting-started/add-sync-client" },
      ],
```

- [ ] **Step 2: Rename the "Live messages" reference label**

Replace:

```ts
        { text: "Live messages", link: "/framework/server/messages" },
```

with:

```ts
        { text: "Sync messages", link: "/framework/server/messages" },
```

- [ ] **Step 3: Rename the "Live blog" guide entry**

Replace:

```ts
        { text: "Live blog", link: "/guides/live-blog" },
```

with:

```ts
        { text: "Sync blog", link: "/guides/sync-blog" },
```

- [ ] **Step 4: Verify the sidebar edits**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -Ec "getting-started/store\"|getting-started/framework\"|Store quickstart|Framework quickstart|Live messages|Live blog|guides/live-blog" apps/docs/vocs.config.ts
grep -Ec "Create Store|Add SSR|Add Sync Client|Sync messages|Sync blog|guides/sync-blog" apps/docs/vocs.config.ts
```

Expected: first command `0` (all old labels/links gone), second command `6`.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/vocs.config.ts
git commit -m "docs(sidebar): three-guide ladder, Sync messages, Sync blog"
```

---

### Task 6: Rename the Live blog guide → Sync blog

**Files:**

- Rename: `apps/docs/src/pages/guides/live-blog.mdx` → `apps/docs/src/pages/guides/sync-blog.mdx`
- Modify: title + prose terminology (keep code symbols and the `vite-blog-framework` example dir name)

- [ ] **Step 1: Git-rename**

```bash
cd /Users/vanya2h/Repos/rxfy
git mv apps/docs/src/pages/guides/live-blog.mdx apps/docs/src/pages/guides/sync-blog.mdx
```

- [ ] **Step 2: Retitle and sweep prose**

Open `apps/docs/src/pages/guides/sync-blog.mdx`. Change the H1 title's user-facing "Live blog" wording to "Sync blog". Then apply the prose rename rules (see Task 8 table) throughout: "live updates" → "real-time sync", "live app" → "synced app", "go live" → "turn on sync", etc. **Keep verbatim:** the `vite-blog-framework` example directory name, and any code symbols (`createLive`, `live.serve`, `createLiveClient`, `/live`).

- [ ] **Step 3: Verify**

```bash
cd /Users/vanya2h/Repos/rxfy
test -f apps/docs/src/pages/guides/sync-blog.mdx && echo "RENAMED_OK"
grep -ci "^# .*live blog" apps/docs/src/pages/guides/sync-blog.mdx
grep -c "vite-blog-framework" apps/docs/src/pages/guides/sync-blog.mdx
```

Expected: `RENAMED_OK`, `0` (no "Live blog" title), and a non-zero count for the preserved example dir name.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages/guides/
git commit -m "docs(guides): rename Live blog to Sync blog"
```

---

### Task 7: Rename the "Live messages" reference page → "Sync messages"

**Files:**

- Modify: `apps/docs/src/pages/framework/server/messages.mdx`

**Note:** This is a reference page under the code-named server section. Rename the page title and experience prose ("live messages"/"live updates" → "sync messages"/"real-time sync") but **keep every code symbol** — `patch`, `stale`, `live.update`, `live.create`, `live.delete` stay verbatim. The URL slug (`/framework/server/messages`) does not change.

- [ ] **Step 1: Retitle and sweep prose**

In `messages.mdx`, change the H1 so its user-facing wording is "Sync messages" (keep any subtitle accurate). Replace prose occurrences of "live message(s)" → "sync message(s)" and "live update(s)" → "real-time sync". Leave code fences and symbols untouched.

- [ ] **Step 2: Verify**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -ci "^# .*sync messages" apps/docs/src/pages/framework/server/messages.mdx
grep -c "patch\|stale" apps/docs/src/pages/framework/server/messages.mdx
```

Expected: `1` (Sync messages title), and a non-zero count (code symbols `patch`/`stale` preserved).

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/framework/server/messages.mdx
git commit -m "docs(reference): rename Live messages page to Sync messages"
```

---

### Task 8: Terminology sweep across the remaining docs prose

**Files (modify prose only, keep code symbols):**

- `apps/docs/src/pages/index.mdx`
- `apps/docs/src/pages/comparison.mdx`
- `apps/docs/src/pages/examples.mdx`
- `apps/docs/src/pages/agent-skills.mdx`
- `apps/docs/src/pages/guides.mdx`
- `apps/docs/src/pages/react.mdx`, `apps/docs/src/pages/react/live-client.mdx`, `apps/docs/src/pages/react/use-state-data.mdx`
- `apps/docs/src/pages/rxfy.mdx`, `apps/docs/src/pages/rxfy/*.mdx`
- `apps/docs/src/pages/core-concepts/*.mdx`
- `apps/docs/src/pages/framework/server.mdx`, `apps/docs/src/pages/framework/server/*.mdx` (except `messages.mdx`, done in Task 7)
- `apps/docs/src/pages/framework/ws.mdx`, `apps/docs/src/pages/framework/ws/*.mdx`

**Rename rules — apply to PROSE ONLY. Never edit code fences or these symbols:** `createLiveClient`, `createLive`, `LiveClient`, `liveClient`, `live.serve`, `live.update`, `live.create`, `live.delete`, `live.hydration`, `live.renew`, the `rxfy-client` package name, the `/live` WebSocket path, `live.hydration`, and directory/example names (`vite-blog-framework`).

| Find (prose, case-insensitive)                               | Replace (match casing)             |
| ------------------------------------------------------------ | ---------------------------------- |
| "the live path" / "the framework path"                       | "the Sync Client path"             |
| "live app" / "a live app"                                    | "synced app" / "a synced app"      |
| "live mode"                                                  | "Sync Client mode"                 |
| "live updates" / "real-time updates"                         | "real-time sync"                   |
| "going live" / "go live"                                     | "turning on sync" / "turn on sync" |
| "the live stack"                                             | "the sync stack"                   |
| "Store quickstart" (link text)                               | "Create Store"                     |
| "Framework quickstart" (link text)                           | "Add Sync Client"                  |
| "live client" (prose describing the concept, not the symbol) | "Sync Client"                      |

- [ ] **Step 1: Find every candidate line**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -rniE "live (app|updates|mode|path|stack|client)|going live|go live|framework path|store quickstart|framework quickstart" apps/docs/src/pages \
  --include=*.mdx | grep -v "framework/server/messages.mdx"
```

Review each hit. For each, decide prose vs. code (code lines contain `createLive`, `live.`, `LiveClient`, backticked symbols, or sit inside a ``` fence — skip those).

- [ ] **Step 2: Apply the replacements per the table**

Edit each file, applying the mapping to prose only. Watch these specifically:

- `index.mdx` — homepage tagline/sections framing "store vs framework"; reframe to the store → +SSR → +Sync Client ladder.
- `comparison.mdx`, `examples.mdx` — link text "Store/Framework quickstart" → "Create Store"/"Add Sync Client".
- `agent-skills.mdx` — path names and mode framing.
- `core-concepts/ssr.mdx` — the `:::tip[Building a live app?]` and "Live apps use a different entry point…" prose → "synced app" / "Synced apps"; keep `live.hydration` symbol.

- [ ] **Step 3: Verify no stray user-facing "live" terminology remains**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -rniE "live (app|updates|mode|stack)|going live|store quickstart|framework quickstart" apps/docs/src/pages --include=*.mdx
```

Expected: no output (empty). Any remaining hit must be an intentional code symbol on a code line — if so, confirm it is a symbol, not prose.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages
git commit -m "docs: sweep live terminology to Sync Client/sync across prose"
```

---

### Task 9: Fix internal links to the renamed slugs

**Files:** any `apps/docs/src/pages/**/*.mdx` still linking to old slugs.

- [ ] **Step 1: Find dangling links**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -rnE "getting-started/store|getting-started/framework|guides/live-blog" apps/docs/src/pages --include=*.mdx
```

- [ ] **Step 2: Rewrite each hit**

Apply: `/getting-started/store` → `/getting-started/create-store`; `/getting-started/framework` → `/getting-started/add-sync-client`; `/guides/live-blog` → `/guides/sync-blog`. Update surrounding link text to match the new names where it still says "Store/Framework quickstart" or "Live blog".

- [ ] **Step 3: Verify no dangling links remain**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -rnE "getting-started/store|getting-started/framework|guides/live-blog" apps/docs/src/pages --include=*.mdx
```

Expected: no output (empty).

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages
git commit -m "docs: repoint internal links to renamed guide slugs"
```

---

### Task 10: Regenerate route types and verify the docs build

**Files:**

- Generated: `apps/docs/src/pages.gen.ts` (route-path union — regenerated from the pages tree)

**Note:** `pages.gen.ts` is a generated file (see its header). It should regenerate when the Vocs/Waku tooling runs. Do not hand-author it unless the build does not update it.

- [ ] **Step 1: Build the docs (regenerates route types, compiles MDX)**

```bash
cd /Users/vanya2h/Repos/rxfy
pnpm --filter docs build
```

Expected: build succeeds. If MDX compile errors surface, fix the offending page and rebuild.

- [ ] **Step 2: Confirm route types updated to the new slugs**

```bash
cd /Users/vanya2h/Repos/rxfy
grep -Ec "getting-started/store'|getting-started/framework'|guides/live-blog'" apps/docs/src/pages.gen.ts
grep -Ec "getting-started/create-store'|getting-started/add-ssr'|getting-started/add-sync-client'|guides/sync-blog'" apps/docs/src/pages.gen.ts
```

Expected: first command `0` (old paths gone), second command `4` (new paths present). If the build did not update `pages.gen.ts`, hand-edit the `Page` union: replace the three old `{ path: '…'; render: 'static' }` lines with the four new ones (`create-store`, `add-ssr`, `add-sync-client`, `guides/sync-blog`) and rebuild.

- [ ] **Step 3: Final full-tree assertion sweep**

```bash
cd /Users/vanya2h/Repos/rxfy
echo "--- sidebar clean ---"; grep -Ec "store quickstart|framework quickstart|Live messages|Live blog" apps/docs/vocs.config.ts
echo "--- prose clean ---";   grep -rniEc "live (app|updates|mode|stack)|store quickstart|framework quickstart" apps/docs/src/pages --include=*.mdx | grep -v ":0" || echo "PROSE_CLEAN"
echo "--- links clean ---";   grep -rnE "getting-started/store|getting-started/framework|guides/live-blog" apps/docs/src/pages --include=*.mdx || echo "LINKS_CLEAN"
```

Expected: sidebar count `0`; prints `PROSE_CLEAN`; prints `LINKS_CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/pages.gen.ts
git commit -m "docs(build): regenerate route types for renamed guides"
```

---

## Self-Review Notes

- **Spec coverage:** two-path index (Task 4); three guides Create Store / Add SSR / Add Sync Client (Tasks 1, 2, 3); scaffold moved to Path B (Task 3 → 4); template index (Task 4); terminology rename incl. Sync blog + Sync messages (Tasks 6, 7, 8); sidebar (Task 5); no redirects, links fixed (Task 9); pages.gen.ts regenerated (Task 10); build passes (Task 10). All spec success criteria mapped.
- **Out of scope honored:** no package-code edits; code symbols preserved by explicit KEEP list in Tasks 3,6,7,8; `.claude` skill files untouched.
- **Verification model:** docs have no unit tests, so each task verifies via grep assertions + the final `vocs build`. This is intentional and stated in the header.
