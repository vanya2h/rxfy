# rxfy Agent Skills Reorganization

**Date:** 2026-07-05
**Status:** Design approved, ready for planning
**Driver:** PR #18 ("docs: reorganize around Store vs Framework paths") introduces a real-time
Framework layer (packages `rxfy-server`, `rxfy-protocol`, `rxfy-ws`, plus new `rxfy-react`
live-client APIs) that the current agent skills do not cover.

## Problem

The repo ships two agent skills today — `rxfy` (store + React bindings) and `rxfy-ssr` (SSR).
PR #18 adds a whole Framework/real-time surface with no skill coverage, and the docs now split
users into two front-door paths: **Store** ("I want normalized reactive client state") and
**Framework** ("I'm building a live app"). The skills should serve those two cohorts.

Additional facts that shape the design:

- Skills are published via `npx skills add vanya2h/rxfy`; the canonical source is
  `.agents/skills/`, and `.claude/skills/` entries are local symlinks — **except** `rxfy` and
  `rxfy-ssr`, which are real copies. The two `rxfy` copies have already **drifted**
  (`.agents` has `createModel({ schema, getKey, name })`, `.claude` has
  `createModel(schema, { getKey, name })`).
- The current `rxfy` skill's "Live / external updates" section teaches a hand-rolled websocket
  integration that the Framework layer now supersedes.

## Goals

1. Cover the new Framework surface in a skill.
2. Organize skills by **user cohort**, not by package or docs-section.
3. Each skill must be **fully self-contained**: a user installs exactly one and it stands
   alone, with no dangling references to a skill they don't have.

## Non-goals

- No changeset (skills and docs are not published npm packages).
- No new build/codegen tooling for the skills (explicitly rejected in favor of copied files).
- Not touching the `rxfy`/`rxfy-react` package source; this is a skills + docs change only.

## Design

### Two cohort-oriented skills, superset relationship

The two skills are **mutually exclusive installs**. A user installs the one matching their
setup, never both. Because they can't assume the other is present, they do not cross-reference
each other — `rxfy-framework` is a **superset** of `rxfy`.

| Skill            | Install for      | Contents                                                                                                                                                           |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rxfy`           | Store-only setup | Store + React + SSR. Fully self-contained, client + serialization, no real-time.                                                                                   |
| `rxfy-framework` | Live-app setup   | **Everything in `rxfy`** (store + React + SSR, re-taught, not referenced) **plus** the real-time layer (server, protocol, ws, live-client, grants/live-hydration). |

Consequences:

- **`rxfy-ssr` is dissolved.** Its base-SSR content moves into a shared `ssr.md` module used by
  both bundles. The framework bundle adds a `grants-hydration.md` module on top.
- **Routing** is driven by each skill's `description` frontmatter. `rxfy` triggers on
  models/states/hooks/lens/atoms/mutations/SSR; `rxfy-framework` additionally triggers on live
  updates, server writes, websockets, patch/stale, and grants.
- **Name:** `rxfy-framework` (matches the docs' "Framework" section and the "framework mode"
  framing).

### Content: modular reference files, copied

Shared store content is authored as small reference files and **copied byte-for-byte** into both
bundles (no build step). Duplication is file-level, so drift is easy to diff and catch.

**Shared store modules** (identical in both bundles):

| File                             | Content                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| `references/models-states.md`    | `createModel`, `defineState`, `array`/`single`, plain value fields        |
| `references/react-bindings.md`   | `useStateData`, `useModelStore`, `useAtom`, `<Pending>`, hook table       |
| `references/mutations-writes.md` | mutations, `set` vs `setRaw`, pagination (`useStatePagedData`)            |
| `references/lens-atoms.md`       | `createAtom`, `createLens`, `keyLens`                                     |
| `references/ssr.md`              | dehydrate/hydrate, buffered/streaming/two-pass, `StoreProvider` SSR props |
| `references/common-mistakes.md`  | the pitfalls table                                                        |

**Framework-only modules** (`rxfy-framework` bundle only):

| File                                | Content                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `references/framework-server.md`    | `defineResource`, `createResourceRegistry`, `createServer`, `live.create/update/delete`, `createInMemoryHub`, `createTopicKeyer` |
| `references/framework-protocol.md`  | patch vs stale, `serialize`/`parseServerMessage`/`parseClientMessage`, `PROTOCOL_VERSION`                                        |
| `references/framework-transport.md` | `createWsServer`, `createWsClient`                                                                                               |
| `references/live-client.md`         | `createLiveClient`, `useLiveClient`, `updatesAvailable$`/`applyUpdates`, `StoreProvider liveClient` prop                         |
| `references/grants-hydration.md`    | `live.grant`, `readSsrGrants`, SSR grant injection — the framework+SSR seam                                                      |

### The two SKILL.md routers

Each SKILL.md is a lean overview + table-of-contents that points into the reference modules.

- **`rxfy/SKILL.md`** — store-cohort overview routing into the 6 shared modules. The current
  hand-rolled-websocket "Live / external updates" section shrinks to a single line ("push into a
  store from any external source" — a genuine store primitive); full socket wiring is out of
  scope for this cohort.
- **`rxfy-framework/SKILL.md`** — framework-cohort overview that opens with a one-line pointer
  ("this is rxfy + real-time; if you only need client state, install `rxfy` instead"), then
  routes into all 11 modules (6 shared + 5 framework). Self-contained; never assumes the `rxfy`
  skill exists.

### Repo layout

Canonical source is `.agents/skills/`.

```
.agents/skills/
  rxfy/
    SKILL.md
    references/            ← 6 shared store modules
  rxfy-framework/
    SKILL.md
    references/            ← same 6 shared (copied verbatim) + 5 framework modules
  (rxfy-ssr/  ← DELETED — dissolved into both)

.claude/skills/
  rxfy           → symlink to ../../.agents/skills/rxfy            (replaces drifted real copy)
  rxfy-framework → symlink to ../../.agents/skills/rxfy-framework
  (rxfy-ssr  ← removed)
```

### Migration steps

1. Build the 6 shared modules by extracting from today's `rxfy/SKILL.md` + `rxfy-ssr/SKILL.md`,
   reconciling the `createModel` drift to the correct current signature (verify against
   `packages/rxfy` source).
2. Author the 5 framework modules from the new package READMEs (`rxfy-server`, `rxfy-protocol`,
   `rxfy-ws`) and the framework/live-client docs pages, verified against package source.
3. Copy the 6 shared modules into both bundles; write both SKILL.md routers.
4. Delete `rxfy-ssr`; replace the drifted `.claude/skills/rxfy` real copy with a symlink and add
   the `.claude/skills/rxfy-framework` symlink.
5. Rewrite `apps/docs/src/pages/agent-skills.mdx`: new "what each skill covers," mutual-exclusivity
   guidance ("install the one matching your setup — not both"), and per-skill install commands.

### Verify during implementation (do not assume)

- **Per-skill install** — confirm the `skills` CLI can select a single skill (e.g.
  `npx skills add vanya2h/rxfy/rxfy-framework`) rather than installing every skill in the repo.
  The `agent-skills.mdx` install instructions depend on the answer. Note the potential
  `vanya2h/rxfy` repo-vs-skill name ambiguity.
- **API accuracy** — every API in the shared and framework modules must be checked against
  current package source, not the READMEs alone (the QueryCache `getOrStart` refactor in this PR
  is internal and does not surface in the skills, but confirm nothing else drifted).

### Optional: drift guard

Because the 6 shared modules are copied, optionally add a lightweight CI check that diffs the
shared files between the two bundles and fails if they diverge. This is a guardrail, not a build
step (it generates nothing). Include or skip at implementation time.

## Open questions

None blocking. The two "verify during implementation" items above are to be resolved as the first
tasks of the plan.
