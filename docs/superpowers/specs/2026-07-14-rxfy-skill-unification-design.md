# rxfy Agent Skill Unification — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan

## Problem

rxfy ships **two** agent skills, `rxfy` and `rxfy-framework`, split by _product / feature depth_ (client store vs. full sync stack), with a "Pick one — never both" rule. That split no longer reflects reality: there is no store-vs-framework product boundary anymore. There is **one framework with progressive integration levels** — Store → +SSR → +Sync.

The split also fails to serve the two ways a project actually arrives at a level:

- **Path A — incremental adoption:** rxfy is added to an existing app, one level at a time.
- **Path B — scaffolded template:** `create-rxfy-app` lands a fully-wired app on a level (`vite-spa` = Store, `next` = +SSR, `vite` = +Sync).

Today both a hand-built synced app and a scaffolded `vite` template route to the same `rxfy-framework` skill, which knows nothing about what a template already wired ("template blindness") and reintroduces a routing decision ("which skill?") the user shouldn't have to make.

## Goal

Collapse to **one skill** whose `SKILL.md` is a **reference library / router** — it tells the agent _when and how to use_ each mini-guide, orients the agent to the project's entry mode and integration level, and lets the agent load only the references its current task needs (progressive disclosure inside the skill).

## Non-Goals

- No changes to the rxfy/rxfy-react/rxfy-server/etc. library code.
- No new templates or changes to `create-rxfy-app`.
- No published-package version bump (skills are not an npm package; no changeset).
- Levels are **not** re-introduced as a rigid backbone or as per-row metadata — they survive only as a teaching thread in orientation.

## Design

### 1. Skill topology

- Merge `rxfy` + `rxfy-framework` into a **single skill named `rxfy`**.
- **Delete `rxfy-framework` entirely** — no stub, no redirect skill. A short note in the docs changelog covers the rename.
- The six shared references stop being duplicated across two skills — one copy each.
- The `framework-*` / grants / sync-client references move into the single skill as the sync-layer mini-guides.
- "Pick one, never both" disappears — there is nothing to pick.
- Progressive disclosure moves _inside_ the skill: `SKILL.md` stays lean; the agent loads only the mini-guides its current task needs, so a client-only project never pulls sync/grants context.

### 2. `SKILL.md` as the reference library

`SKILL.md` stays short and does four jobs in order:

1. **What rxfy is** — one paragraph: one framework, progressive integration levels (Store → +SSR → +Sync). No product split.
2. **Invariant rules** — always-true, bug-preventing rules, each with an inline "applies when":
   - id-vs-entity: `data$` from `useStateData` emits **ids**; read entities via `useModelStore(model).get(id)` — _always_.
   - patch-vs-stale: `patch` edits an entity in place; `stale` never edits a list — it bumps `updatesAvailable$` and the client refetches via `applyUpdates()` — _only once on sync_.
3. **Orientation pointer** — "If you haven't established this project's entry mode and level this session, read `references/orientation.md` first." (Once-per-session gate, not once-per-task.)
4. **The library table** — task-indexed rows, two columns, `Read` / `When you're…`:

| Read                  | When you're…                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `models-states.md`    | declaring models/states, `array`/`single`, plain value fields        |
| `react-bindings.md`   | reading data in React — `useStateData`, `useModelStore`, `<Pending>` |
| `mutations-writes.md` | local writes, `set` vs `setRaw`, pagination                          |
| `lens-atoms.md`       | nested/derived state — `createAtom`, `createLens`, `keyLens`         |
| `ssr.md`              | server-render + hydrate, streaming, two-pass                         |
| `sync-server.md`      | `defineResource`, `sync.create/update/delete`, hub                   |
| `sync-client.md`      | `createSyncClient`, `updatesAvailable$` / `applyUpdates`             |
| `sync-grants.md`      | `$grant`, subscribe frames, renewal, `readSsrGrants`                 |
| `sync-protocol.md`    | patch/stale/subscribe wire format, codec                             |
| `sync-transport.md`   | `createWsServer` / `createWsClient`, transports, reconnect           |
| `templates.md`        | working in a scaffolded app — what each template pre-wired           |
| `common-mistakes.md`  | debugging — check here first                                         |

No level-tag column: the task phrasing in "When you're…" already implies when a row applies, so a `Needs` tag would only restate it.

### 3. Reference / mini-guide layout

- **Carried over as-is** (one copy each): `models-states.md`, `react-bindings.md`, `mutations-writes.md`, `lens-atoms.md`, `ssr.md`, `common-mistakes.md`.
- **Renamed** (drop the `framework-` prefix — not a separate product):
  - `framework-server.md` → `sync-server.md`
  - `framework-protocol.md` → `sync-protocol.md`
  - `framework-transport.md` → `sync-transport.md`
  - `live-grants.md` → `sync-grants.md`
  - `sync-client.md` — unchanged name.
- **New `templates.md`** — a manifest mini-guide: for each template (`vite-spa`, `next`, `vite`) what is already wired, where the model/state lives, where to add the next one, and what _not_ to rebuild. Fixes template blindness in one read.
- **New `orientation.md`** — the front-door (see 4).
- `common-mistakes.md` absorbs the sync-specific pitfalls too — the single debugging entry point.
- Every mini-guide stays self-contained and single-activity, so the agent loads one or two, not the whole set.

### 4. `orientation.md` — the front-door

A short decision aid the agent reads once per session on first contact. It answers two questions from **on-disk signals**, not by interrogating the user, then emits a one-line routing verdict and gets out of the way (no duplicated content).

**Q1 — how did this code get here?**

- Scaffolded template → detect via `create-rxfy-app` markers / known template layout / stack fingerprint (e.g. Hono + Drizzle + PGlite for `vite`). → read `templates.md` first so wired plumbing is not rebuilt.
- Existing app adopting rxfy → no template markers; rxfy deps added to an established project. → task is _adding a capability_; go straight to the relevant task mini-guide.

**Q2 — how integrated already?** (extend, don't duplicate)

- `rxfy` + `rxfy-react` only, no server → **Store**.
- SSR wiring present (`dehydrate`/`hydrate`, `HydrationStream`, RSC prefetch) → **+SSR**.
- `rxfy-server`/`rxfy-ws`/`rxfy-client`, `createSyncClient`, `defineResource` → **+Sync**.

**Output:** a routing verdict, e.g. _"scaffolded `vite` template, sync level → read `templates.md`, then `sync-server.md` to add a resource."_ Explicitly flags non-linear cases (e.g. a `vite-spa` that later added sync without SSR) so the ladder assumption never bites.

### 5. Docs alignment + migration

- **`apps/docs/src/pages/agent-skills.mdx` rewrite** — remove "Pick one — never both"; new framing: _one skill, mirrors the one framework; it orients itself to your integration level and entry mode._ Collapse the two-row install table to a single command:
  ```bash
  npx skills add vanya2h/rxfy --skill rxfy
  ```
  "What the skills cover" becomes one list organized like the library (core → SSR → sync), noting it also reads scaffolded templates.
- **`apps/docs/src/pages/getting-started.mdx`** — Path A / Path B stay (still the two entry modes); only the skills cross-reference updates to the single skill.
- **`apps/docs/src/pages/changelog.mdx`** — a note recording the `rxfy-framework` → `rxfy` merge/rename.
- No stub skill; no `pnpm changeset`.

## Open questions

None. All decisions confirmed during brainstorming.
