# rxfy Agent Skills Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `rxfy` + `rxfy-ssr` skills with two mutually-exclusive, cohort-oriented skill bundles — `rxfy` (store + React + SSR) and `rxfy-framework` (superset: everything in `rxfy` plus the real-time layer) — built from modular reference files.

**Architecture:** Canonical source is `.agents/skills/`. Six shared store reference modules are extracted from the existing `rxfy` and `rxfy-ssr` SKILL.md files and copied byte-for-byte into both bundles; five framework-only modules are authored fresh from package source + docs. Each SKILL.md is a lean router. `.claude/skills/` entries become symlinks. A drift-check script guards the copied shared files.

**Tech Stack:** Markdown skills (`SKILL.md` + `references/*.md`), the `skills` CLI (`npx skills add vanya2h/rxfy --skill <name>` — the `-s/--skill` flag is confirmed to exist), vocs docs site.

**Spec:** `docs/superpowers/specs/2026-07-05-rxfy-skills-reorg-design.md`

**Verified facts (do not re-derive):**
- `createModel({ schema, getKey, name })` takes a single config object (see `packages/rxfy/src/model/model.ts:30`). The `.agents/skills/rxfy/SKILL.md` copy is correct; the `.claude/skills/rxfy/SKILL.md` copy (`createModel(schema, {...})`) is the drifted one.
- `rxfy-ws` client entry is the `rxfy-ws/client` subpath; server entry is `rxfy-ws`.
- `rxfy-server/browser` re-exports the client-safe subset (`defineResource`, `createResourceRegistry`).
- `rxfy-react` exports: `createLiveClient`, `readSsrGrants`, `useLiveClient`, `stateChannel`, types `Grants`, `LiveClient`, `LiveTransport`, `ChannelCounter`, `ChannelStateDescriptor`.
- Docs build: `pnpm --filter docs build` (vocs).
- Commit messages: plain, no Co-Authored-By trailers (user preference).

---

### Task 1: Extract the 6 shared store modules into `.agents/skills/rxfy/references/`

**Files:**
- Create: `.agents/skills/rxfy/references/models-states.md`
- Create: `.agents/skills/rxfy/references/react-bindings.md`
- Create: `.agents/skills/rxfy/references/mutations-writes.md`
- Create: `.agents/skills/rxfy/references/lens-atoms.md`
- Create: `.agents/skills/rxfy/references/ssr.md`
- Create: `.agents/skills/rxfy/references/common-mistakes.md`
- Source (read-only this task): `.agents/skills/rxfy/SKILL.md`, `.agents/skills/rxfy-ssr/SKILL.md`

Reference files have **no YAML frontmatter** — just a `#` title. Content is extracted from the two existing SKILL.md files (the `.agents` copies, which are canonical). Line numbers below refer to the files as of commit `0c26fdb`.

- [ ] **Step 1: Create `models-states.md`**

Title `# Models & States`. Content: the intro paragraph of `.agents/skills/rxfy/SKILL.md` (line 12) followed by the "Core Building Blocks" table (lines 14–27) **minus** the `createAtom` and `createLens` rows (those move to `lens-atoms.md`). Keep the `createModel({ schema, getKey, name })` row exactly as written in the `.agents` copy. Append this note after the table:

```markdown
> SSR requires `name` on `createModel` and `key` on `defineState` — models/states missing them are silently skipped during `dehydrate`. See `ssr.md`.
```

- [ ] **Step 2: Create `react-bindings.md`**

Title `# React Bindings (rxfy-react)`. Content: lines 28–66 of `.agents/skills/rxfy/SKILL.md` verbatim (the numbered tsx walkthrough + the "Hook quick-reference" table).

- [ ] **Step 3: Create `mutations-writes.md`**

Title `# Mutations, Writes & Pagination`. Content: lines 67–120 of `.agents/skills/rxfy/SKILL.md` verbatim (Mutations, `set` vs `setRaw`, Pagination sections), then append a trimmed replacement for the old "Live / external updates" section (lines 122–137) — keep only the store-primitive core, drop the hand-rolled socket wiring:

```markdown
## External writes

Any out-of-band source can push entities straight into a store — every `store.get(id)` subscriber re-renders, no refetch:

​```ts
const store = useModelStore(todoModel);
store.setMany(rows.map((row) => todoModel.schema.parse(row))); // validate, then normalize

// React to entities entering ANY store:
const registry = useModelRegistry();
registry.added$.subscribe(({ name, key }) => {/* track what's on screen */});
​```
```

(Remove the zero-width characters around the backticks when writing the actual file — they are only there to nest the fence in this plan.)

- [ ] **Step 4: Create `lens-atoms.md`**

Title `# Atoms & Lens`. Content: the `createAtom` and `createLens` rows pulled from the Core Building Blocks table, formatted as a 2-row table with the same column headers, followed by the "Lens for Nested State" section (lines 139–145 of `.agents/skills/rxfy/SKILL.md`) verbatim.

- [ ] **Step 5: Create `ssr.md`**

Title `# SSR`. Content: lines 10–133 of `.agents/skills/rxfy-ssr/SKILL.md` verbatim — intro paragraph, Prerequisites, Mode 1 (buffered), Mode 2 (streaming/HydrationStream), Mode 3 (two-pass), StoreProvider SSR Props, SSR APIs. Do **not** include its Common Mistakes table (that merges into `common-mistakes.md`).

- [ ] **Step 6: Create `common-mistakes.md`**

Title `# Common Mistakes`. Content: one merged table — the 7 rows from `.agents/skills/rxfy/SKILL.md` lines 149–157 followed by the 6 rows from `.agents/skills/rxfy-ssr/SKILL.md` lines 137–143, under two subheadings `## Store & React` and `## SSR`.

- [ ] **Step 7: Verify extraction completeness**

Run: `grep -c "createModel({ schema" .agents/skills/rxfy/references/models-states.md`
Expected: `1` (object-config signature preserved).

Run: `grep -rn "socket.addEventListener" .agents/skills/rxfy/references/`
Expected: no matches (hand-rolled socket wiring dropped).

- [ ] **Step 8: Commit**

```bash
git add .agents/skills/rxfy/references/
git commit -m "docs(skills): extract shared store modules into rxfy references"
```

---

### Task 2: Rewrite `rxfy/SKILL.md` as the store-cohort router

**Files:**
- Modify: `.agents/skills/rxfy/SKILL.md` (full replacement)

- [ ] **Step 1: Replace SKILL.md with the router**

Write exactly this content (single outer file; the inner fences are part of it):

````markdown
---
name: rxfy
description: Use when working with the rxfy or rxfy-react packages in a client-state setup — declaring models and states, subscribing to reactive data in React, handling async status (IDLE/PENDING/FULFILLED/REJECTED), composing nested state with Lens, binding atoms, calling mutations, paginating, or wiring SSR (dehydrate/hydrate, HydrationStream streaming, two-pass). Also use when encountering "entity is not loaded" errors or confusion between normalized ids and entity data.
license: MIT
metadata:
  author: vanya2h
  version: "2.0.0"
---

# rxfy

Minimalistic, RxJS-backed library for typed, normalized, reactive state in React. Entities live in shared `ModelStore`s keyed by id; each page declares its own state over those stores — the query holds only ids and resolves entities from the stores. A single `store.set` reactively updates every component showing that entity. States and stores are serializable, so SSR is first-class.

This skill covers the **store setup**: client state + SSR. (Real-time server push is a separate setup with its own skill, `rxfy-framework`.)

## The one rule that prevents most bugs

`data$` from `useStateData` emits the **query shape** — model fields hold **ids**, not entities. Read entities via `useModelStore(model).get(id)`.

## Reference modules

| Read | When working on |
|---|---|
| `references/models-states.md` | `createModel`, `defineState`, `array`/`single`, plain value fields |
| `references/react-bindings.md` | `useStateData`, `useModelStore`, `useAtom`, `<Pending>`, hook table |
| `references/mutations-writes.md` | mutations, `set` vs `setRaw`, pagination, external writes |
| `references/lens-atoms.md` | `createAtom`, `createLens`, `keyLens` nested state |
| `references/ssr.md` | dehydrate/hydrate, buffered/streaming/two-pass SSR, StoreProvider props |
| `references/common-mistakes.md` | debugging — check here first for known pitfalls |

## Minimal shape

```tsx
const Todo = createModel({ schema: todoSchema, getKey: (t) => t.id, name: "todos" });
const listState = defineState({ key: "todos", params: z.object({}), model: { todos: array(Todo) } });

const { data$ } = useStateData({ state: listState, fetchFn, params });
<Pending value$={data$}>{({ todos }) => todos.map((id) => <TodoItem key={id} id={id} />)}</Pending>
```
````

- [ ] **Step 2: Verify no dangling references**

Run: `grep -n "rxfy-ssr\|rxfy-framework skill\|see the .*skill" .agents/skills/rxfy/SKILL.md .agents/skills/rxfy/references/*.md`
Expected: only the single intentional mention of `rxfy-framework` in SKILL.md's intro parenthetical (naming the other setup is fine; **depending** on it is not). No `rxfy-ssr` matches.

- [ ] **Step 3: Commit**

```bash
git add .agents/skills/rxfy/SKILL.md
git commit -m "docs(skills): rewrite rxfy SKILL.md as store-cohort router"
```

---

### Task 3: Author the framework transport-layer modules (server, protocol, ws)

**Files:**
- Create: `.agents/skills/rxfy-framework/references/framework-server.md`
- Create: `.agents/skills/rxfy-framework/references/framework-protocol.md`
- Create: `.agents/skills/rxfy-framework/references/framework-transport.md`
- Source material (verify against, don't invent): `packages/rxfy-server/src/*.ts`, `packages/rxfy-protocol/src/*.ts`, `packages/rxfy-ws/src/*.ts`, `apps/docs/src/pages/framework/{server,protocol,ws}.mdx`

- [ ] **Step 1: Create `framework-server.md`**

Title `# rxfy-server`. Cover, in this order, condensing from `apps/docs/src/pages/framework/server.mdx` (keep code snippets, drop long prose):

1. Intro: binds Drizzle tables to rxfy models, writes through the server, publishes live messages via a hub. Server-side only; `rxfy-server/browser` re-exports the client-safe subset.
2. `defineResource({ table, model })` — resource `name` defaults to `model.name`, must match the client model's `name` so `patch` messages land in the right store. Single-column PK only (`primaryKeyColumn` throws on composite keys).
3. `createResourceRegistry([...])` — indexes by name, rejects duplicates, exposes `byName`/`model`/`all`.
4. `createServer({ db, resources, hub, keyer })` → `Live` — include the `server/live.ts` snippet from the docs page verbatim.
5. Writes table:

| Call | SQL | Publishes |
|---|---|---|
| `live.update(resource, id, patch)` | UPDATE … RETURNING | `patch` on `"<name>:<id>"` topic + `stale` on touched channels |
| `live.create(resource, row, { touch })` | INSERT | `stale` on touched channels only (no patch) |
| `live.delete(resource, id, { touch })` | DELETE | `stale` on touched channels only |
| `live.touch(...targets)` | none | `stale` out of band |

6. `touch(stateDescriptor, params)` builds a `TouchTarget`; window dims (`state.window`) are stripped so all pages of a partition share one channel.
7. `createTopicKeyer({ secret, windowMs })` — HMAC time-windowed topic ids; `current(topic)` for grants, `forPublish(topic)` returns `[current, previous]` to cover window rollover. Warning: rotating `secret` invalidates all outstanding grants.
8. `createInMemoryHub()` — single-process pub/sub; `onPublish(sink)`, `subscribe`/`unsubscribe`/`drop`.
9. `live.grant(registry, { entities, states })` — one-paragraph pointer: covered in depth in `grants-hydration.md`.

- [ ] **Step 2: Create `framework-protocol.md`**

Title `# rxfy-protocol`. Condense from `apps/docs/src/pages/framework/protocol.mdx`:

1. Intro: wire contract between `rxfy-server` and `rxfy-ws`; only imported directly for custom transports.
2. Message tables (server→client `patch`/`stale`, client→server `subscribe`/`unsubscribe`) — copy the two tables from the docs page verbatim.
3. Constructors snippet (`patch(...)`, `stale(...)`, `subscribe(...)`, `unsubscribe(...)`) — copy verbatim.
4. Codec: `serialize` (superjson — `Date`/`Map`/`Set` survive), `parseServerMessage`, `parseClientMessage`, `ProtocolError`.
5. `PROTOCOL_VERSION = 1` — exact-match check, no negotiation; a bump requires coordinated upgrade of all peers.

- [ ] **Step 3: Create `framework-transport.md`**

Title `# rxfy-ws`. Condense from `apps/docs/src/pages/framework/ws.mdx`:

1. Two entry points: `rxfy-ws` (server) and `rxfy-ws/client` (browser).
2. Server: `createWsServer(hub)` → `{ handleConnection(socket) }`; `ServerSocket` is structural (`{ send, on }`) — the `ws` package satisfies it directly; wrapped-socket frameworks (Hono, Bun) need the EventEmitter adapter — include the Hono `liveRoute` snippet from the docs page verbatim.
3. Client: `createWsClient({ url, WebSocketImpl?, reconnectDelayMs? })` → `ClientTransport` (`subscribe`/`unsubscribe`/`onMessage`/`close`) — include the type-signature block from the docs page. Auto-reconnect: keeps the active-subscription set, replays subscribe frames on reopen, buffers pre-`OPEN` subscriptions. `onMessage` is single-slot — a later call replaces the handler.

- [ ] **Step 4: Verify APIs against source**

Run: `grep -n "export function createWsServer" packages/rxfy-ws/src/server.ts && grep -n "export function createWsClient" packages/rxfy-ws/src/client.ts && grep -n "PROTOCOL_VERSION" packages/rxfy-protocol/src/*.ts | head -3`
Expected: all three found. If any name differs from the module content, fix the module (source wins over docs).

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/rxfy-framework/references/
git commit -m "docs(skills): author framework server/protocol/transport modules"
```

---

### Task 4: Author the framework client-side modules (live-client, grants)

**Files:**
- Create: `.agents/skills/rxfy-framework/references/live-client.md`
- Create: `.agents/skills/rxfy-framework/references/grants-hydration.md`
- Source material: `apps/docs/src/pages/react/live-client.mdx`, `apps/docs/src/pages/framework/grants.mdx`, `packages/rxfy-react/src/live/*.ts`

- [ ] **Step 1: Create `live-client.md`**

Title `# Live client (rxfy-react)`. Condense from `apps/docs/src/pages/react/live-client.mdx`:

1. `createLiveClient({ registry, transport, grants })` — applies inbound `patch` messages to named model stores, increments channel counters on invalidation, auto-subscribes newly tracked entities via `registry.added$`, exposes `channel(name)`, `addGrants(grants)`, `stop()`. In practice always pass `grants: readSsrGrants()`.
2. `StoreProvider liveClient` prop — include the `hydrateRoot` snippet from the docs page. When omitted, `updatesAvailable$` stays `0` and `applyUpdates` falls back to plain `reload()`.
3. `useLiveClient()` → `LiveClient | null` — escape hatch for custom transports / imperative `addGrants`.
4. `updatesAvailable$` / `applyUpdates` on every `StateHandle` — counter increments on `stale` for this state's channel; `applyUpdates()` resets + `reload()`. Include the abbreviated `UpdatesBadge` snippet from the docs page.
5. patch vs stale from the client's perspective: `patch` applies silently in place (entity cell updates, id list untouched); `stale` surfaces a refresh affordance ("N new — click to refresh") because in-place list edits would require the server to know every client's ordering/filter state.

- [ ] **Step 2: Create `grants-hydration.md`**

Title `# Grants & live hydration`. Condense from `apps/docs/src/pages/framework/grants.mdx`:

1. Why: topics/channels are capabilities; clients cannot self-issue subscriptions. The server mints a signed allow-list (grants) from the rendered registry — only what was actually fetched during the render is grantable.
2. Server: `live.grant(registry, { entities, states })` **after `onAllReady`** (registry must be fully populated); spread into `hydrationScript({ ...dehydrate(registry), grants })` — include the `entry-server.tsx` snippet from the docs page verbatim. Grants shape: `{ entities: Record<string, string>, channels: Record<string, string> }`.
3. Client: `readSsrGrants()` → pass to `createLiveClient` → pass client to `StoreProvider` — include the `entry-client.tsx` snippet verbatim (note the `rxfy-ws/client` import and wss/ws protocol switch).
4. State channels: `invalidationChannel(state, params)` is pure and deterministic on both sides; window dims are stripped. Pass the **same `params` object you passed to `useStateData`** to `live.grant`'s `states` — `invalidationChannel` strips window keys internally so both sides agree.

- [ ] **Step 3: Verify APIs against source**

Run: `grep -n "readSsrGrants\|createLiveClient\|useLiveClient" packages/rxfy-react/src/index.tsx`
Expected: all three exported. Also run `grep -n "grant" packages/rxfy-server/src/server.ts | head -5` and confirm `live.grant`'s spec shape matches what the module says.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/rxfy-framework/references/
git commit -m "docs(skills): author live-client and grants-hydration modules"
```

---

### Task 5: Copy shared modules + write `rxfy-framework/SKILL.md` router

**Files:**
- Create: `.agents/skills/rxfy-framework/references/{models-states,react-bindings,mutations-writes,lens-atoms,ssr,common-mistakes}.md` (byte-for-byte copies)
- Create: `.agents/skills/rxfy-framework/SKILL.md`

- [ ] **Step 1: Copy the 6 shared modules verbatim**

```bash
for f in models-states react-bindings mutations-writes lens-atoms ssr common-mistakes; do
  cp .agents/skills/rxfy/references/$f.md .agents/skills/rxfy-framework/references/$f.md
done
```

- [ ] **Step 2: Write `rxfy-framework/SKILL.md`**

Write exactly this content:

````markdown
---
name: rxfy-framework
description: Use when working with the rxfy live-app stack — rxfy/rxfy-react store state (models, states, hooks, mutations, Lens, SSR) plus the real-time framework packages rxfy-server, rxfy-protocol, and rxfy-ws. Covers declaring models and states, reactive React data, dehydrate/hydrate SSR, Drizzle-bound resources, live.create/update/delete writes, patch/stale messages, WebSocket transports, createLiveClient, updatesAvailable$/applyUpdates, grants, and live hydration. Also use for "entity is not loaded" errors, id-vs-entity confusion, or live updates not reaching the client.
license: MIT
metadata:
  author: vanya2h
  version: "2.0.0"
---

# rxfy (framework mode)

The full rxfy live-app stack: typed, normalized, reactive client state **plus** server-pushed live updates. Entities live in shared `ModelStore`s keyed by id; server writes publish `patch`/`stale` messages over a WebSocket, the client writes them into the same stores, and every subscribed component re-renders — no polling, no refetch.

This skill is self-contained: it covers the store layer, SSR, and the real-time layer. (If the project only needs client state with no live push, the standalone `rxfy` skill is the better install — but never install both.)

## The two rules that prevent most bugs

1. `data$` from `useStateData` emits **ids**, not entities — read entities via `useModelStore(model).get(id)`.
2. `patch` updates an entity in place; `stale` never edits a list — it increments `updatesAvailable$` and the client refetches via `applyUpdates()`.

## Data flow

```
Drizzle table → defineResource → live.update → hub.publish(patch) → WebSocket → client store → subscribers re-render
live.create/delete + touch() → hub.publish(stale) → channel counter → "N new — refresh" badge → applyUpdates() → refetch
```

## Reference modules

**Store layer** (client state + SSR):

| Read | When working on |
|---|---|
| `references/models-states.md` | `createModel`, `defineState`, `array`/`single`, plain value fields |
| `references/react-bindings.md` | `useStateData`, `useModelStore`, `useAtom`, `<Pending>`, hook table |
| `references/mutations-writes.md` | mutations, `set` vs `setRaw`, pagination, external writes |
| `references/lens-atoms.md` | `createAtom`, `createLens`, `keyLens` nested state |
| `references/ssr.md` | dehydrate/hydrate, buffered/streaming/two-pass SSR, StoreProvider props |
| `references/common-mistakes.md` | debugging — check here first for known pitfalls |

**Real-time layer:**

| Read | When working on |
|---|---|
| `references/framework-server.md` | `defineResource`, `createServer`, `live.create/update/delete`, hub, topic keyer |
| `references/framework-protocol.md` | patch/stale wire format, codec, `PROTOCOL_VERSION` |
| `references/framework-transport.md` | `createWsServer`, `createWsClient`, socket adapters, reconnect |
| `references/live-client.md` | `createLiveClient`, `useLiveClient`, `updatesAvailable$`/`applyUpdates`, `liveClient` prop |
| `references/grants-hydration.md` | `live.grant`, `readSsrGrants`, SSR grant injection, state channels |
````

- [ ] **Step 3: Verify copies are identical**

Run: `for f in models-states react-bindings mutations-writes lens-atoms ssr common-mistakes; do diff -q .agents/skills/rxfy/references/$f.md .agents/skills/rxfy-framework/references/$f.md || echo "DRIFT: $f"; done`
Expected: no output (all identical).

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/rxfy-framework/
git commit -m "docs(skills): add rxfy-framework skill bundle"
```

---

### Task 6: Delete `rxfy-ssr`, fix `.claude/skills` symlinks

**Files:**
- Delete: `.agents/skills/rxfy-ssr/`, `.claude/skills/rxfy-ssr/`
- Replace with symlinks: `.claude/skills/rxfy`, add `.claude/skills/rxfy-framework`

- [ ] **Step 1: Remove rxfy-ssr and the drifted real copies**

```bash
git rm -r .agents/skills/rxfy-ssr .claude/skills/rxfy-ssr .claude/skills/rxfy
```

- [ ] **Step 2: Create symlinks (matching the pattern of the other `.claude/skills` entries)**

```bash
ln -s ../../.agents/skills/rxfy .claude/skills/rxfy
ln -s ../../.agents/skills/rxfy-framework .claude/skills/rxfy-framework
git add .claude/skills/rxfy .claude/skills/rxfy-framework
```

- [ ] **Step 3: Verify**

Run: `ls -l .claude/skills/ && readlink .claude/skills/rxfy .claude/skills/rxfy-framework && grep -rn "rxfy-ssr" .agents/ .claude/skills/ 2>/dev/null`
Expected: both are symlinks into `.agents/skills/`; zero `rxfy-ssr` matches.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs(skills): remove rxfy-ssr, symlink .claude skills to .agents"
```

---

### Task 7: Drift-check script

**Files:**
- Create: `scripts/check-skills-drift.sh`
- Modify: `package.json` (root — add script)

- [ ] **Step 1: Write the check script**

```bash
#!/usr/bin/env bash
# Fails if the shared store modules copied into both skill bundles have diverged.
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
for f in models-states react-bindings mutations-writes lens-atoms ssr common-mistakes; do
  a=".agents/skills/rxfy/references/$f.md"
  b=".agents/skills/rxfy-framework/references/$f.md"
  if ! diff -q "$a" "$b" >/dev/null; then
    echo "DRIFT: $f.md differs between rxfy and rxfy-framework bundles" >&2
    status=1
  fi
done
exit $status
```

Then: `chmod +x scripts/check-skills-drift.sh`

- [ ] **Step 2: Add root package.json script**

Add to the root `package.json` `"scripts"` block:

```json
"check:skills-drift": "./scripts/check-skills-drift.sh"
```

- [ ] **Step 3: Run it**

Run: `pnpm check:skills-drift`
Expected: exit 0, no output. Then temporarily append a char to one copy, re-run, confirm it fails with the DRIFT message, and revert.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-skills-drift.sh package.json
git commit -m "chore: add skills shared-module drift check"
```

---

### Task 8: Rewrite `agent-skills.mdx`

**Files:**
- Modify: `apps/docs/src/pages/agent-skills.mdx` (full replacement)

- [ ] **Step 1: Replace the page**

Write exactly this content:

````markdown
# Agent Skills [Accurate rxfy context for AI coding assistants]

rxfy ships two **agent skills** — structured reference files that AI coding assistants (Claude Code, GitHub Copilot Agent, Codex, and others) load on demand to get accurate, rxfy-specific guidance without hallucinating APIs.

Without a skill an agent has only its training data: it may invent hook signatures, confuse normalized ids with entity data, or silently omit the `name`/`key` fields that SSR requires. With a skill it has the real API surface and the common pitfalls already in context.

## Pick one — never both

The two skills mirror the two [getting-started paths](/getting-started). Each is fully self-contained; install the one matching your setup:

| Your setup | Install |
|---|---|
| Client-only store — `rxfy` + `rxfy-react`, with or without SSR | `rxfy` |
| Live app — the framework packages (`rxfy-server`, `rxfy-ws`) on top | `rxfy-framework` |

`rxfy-framework` already contains everything in `rxfy`, so installing both only duplicates context and confuses skill routing.

## Install

```bash
# store setup
npx skills add vanya2h/rxfy --skill rxfy

# framework (live-app) setup
npx skills add vanya2h/rxfy --skill rxfy-framework
```

## What the skills cover

**`rxfy`** — the store path:

- Models (`createModel`) and states (`defineState`), including [plain value fields](/core-concepts/state#plain-value-fields)
- The normalized data flow: `useStateData` returns ids, `useModelStore` gives entities
- `useAtom`, `usePending`, `<Pending>` — async rendering patterns
- Mutations, `set` vs `setRaw`, pagination with `useStatePagedData`
- Lens composition with `createLens` / `keyLens`
- SSR: `name`/`key` requirements, buffered (`onAllReady`), streaming (`<HydrationStream />`), and two-pass (`collectStateData`) modes
- Common mistakes: inline observable creation, `store.entity()` guards, atom stability, missing-data-after-SSR

**`rxfy-framework`** — everything above, plus the real-time layer:

- Binding Drizzle tables with `defineResource` and writing through `live.create` / `live.update` / `live.delete`
- `patch` vs `stale`: which writes publish what, and why lists refresh instead of mutating in place
- The wire protocol and the `rxfy-ws` transports (`createWsServer`, `createWsClient`)
- `createLiveClient`, the `StoreProvider` `liveClient` prop, and `updatesAvailable$` / `applyUpdates`
- Grants and live hydration: `live.grant`, `readSsrGrants`, topic keyers, and state channels
````

- [ ] **Step 2: Check links and build the docs**

Run: `grep -rn "agent-skills\|rxfy-ssr" apps/docs/src/pages --include="*.mdx" -l | xargs grep -n "rxfy-ssr" 2>/dev/null`
Expected: no remaining `rxfy-ssr` skill mentions in docs pages (fix any found).

Run: `pnpm --filter docs build`
Expected: vocs build succeeds with no dead-link errors.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/pages/agent-skills.mdx
git commit -m "docs: rewrite agent-skills page for the two-skill split"
```

---

### Task 9: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Drift check**

Run: `pnpm check:skills-drift`
Expected: exit 0.

- [ ] **Step 2: Structure check**

Run: `find .agents/skills -name "*.md" | sort`
Expected exactly:

```
.agents/skills/documentation-writer/SKILL.md
.agents/skills/rxfy-framework/SKILL.md
.agents/skills/rxfy-framework/references/common-mistakes.md
.agents/skills/rxfy-framework/references/framework-protocol.md
.agents/skills/rxfy-framework/references/framework-server.md
.agents/skills/rxfy-framework/references/framework-transport.md
.agents/skills/rxfy-framework/references/grants-hydration.md
.agents/skills/rxfy-framework/references/lens-atoms.md
.agents/skills/rxfy-framework/references/live-client.md
.agents/skills/rxfy-framework/references/models-states.md
.agents/skills/rxfy-framework/references/mutations-writes.md
.agents/skills/rxfy-framework/references/react-bindings.md
.agents/skills/rxfy-framework/references/ssr.md
.agents/skills/rxfy/SKILL.md
.agents/skills/rxfy/references/common-mistakes.md
.agents/skills/rxfy/references/lens-atoms.md
.agents/skills/rxfy/references/models-states.md
.agents/skills/rxfy/references/mutations-writes.md
.agents/skills/rxfy/references/react-bindings.md
.agents/skills/rxfy/references/ssr.md
(+ setup-release/stop-slop/turborepo files, unchanged)
```

- [ ] **Step 3: API-accuracy spot check**

Run each and confirm the named export exists where the modules say it does:

```bash
grep -n "export function createModel" packages/rxfy/src/model/model.ts        # object-config signature
grep -n "createLiveClient\|readSsrGrants" packages/rxfy-react/src/index.tsx
grep -n "export function createServer" packages/rxfy-server/src/server.ts
grep -n "export function createWsClient" packages/rxfy-ws/src/client.ts
```

- [ ] **Step 4: Skills CLI listing check**

Run: `npx -y skills@latest add . --list`
Expected: lists exactly two skills — `rxfy` and `rxfy-framework`. (If the CLI can't take a local path, skip — the `--skill` flag itself is already confirmed.)

- [ ] **Step 5: Full repo checks**

Run: `turbo lint check-types`
Expected: pass (skills are markdown, but the package.json edit and docs page must not break anything).

---

## Out of scope

- No changeset (skills and docs are not published npm packages).
- No changes to package source code.
- CI wiring for the drift check (script exists; adding it to a workflow can ride any future CI change).
