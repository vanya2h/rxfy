# Playwright e2e for sync examples — design

**Date:** 2026-07-14
**Status:** Approved design, pre-implementation
**Goal:** Catch any regression in real-time **sync behavior** across every sync-capable example/template before release, by driving them in a real browser with Playwright.

## Motivation

The repo already has `*.smoke.test.ts` (vitest) that exercise the sync path over an in-memory
socket pair. Those verify the wiring in isolation, but nothing drives the actual apps end to end in
a browser: real HTTP + real WebSocket + real hydration + real React rendering. A sync regression
(badge not appearing, patch not landing, grant renewal broken) would ship undetected. This suite
closes that gap and becomes a release gate.

## Scope

**In scope — the sync-capable apps only:**

| App                 | Path                           | Sync stack            | Capability tag |
| ------------------- | ------------------------------ | --------------------- | -------------- |
| next-blog           | `examples/next-blog`           | rxfy-client + rxfy-ws | `sync-blog`    |
| rr7-blog            | `examples/rr7-blog`            | rxfy-client + rxfy-ws | `sync-blog`    |
| vite-blog-framework | `examples/vite-blog-framework` | rxfy-client + rxfy-ws | `sync-blog`    |
| waku-blog           | `examples/waku-blog`           | rxfy-client + rxfy-ws | `sync-blog`    |
| vite (template)     | `templates/vite`               | rxfy-client + rxfy-ws | `sync-todos`   |

**Explicitly out of scope** (no live sync — carry no sync regression risk):
`examples/vite-ssr-pagination`, `templates/next`, `templates/vite-spa`.

The four `sync-blog` apps render **identical UI** from the private `examples-shared` package, so one
parametrized spec runs against all four. `templates/vite` has bespoke todos UI and gets its own
short spec.

Non-goals: visual/screenshot assertions, multi-browser matrix (Chromium only to start),
multi-process cross-client testing (two browser contexts against one server is faithful and cheaper).

## Architecture

A new **private** workspace package `examples/e2e` (never published), owning all Playwright infra.

```
examples/e2e/
  package.json            # private, deps: @playwright/test; scripts: test, test:ui, install-browsers
  playwright.config.ts    # projects[] + webServer[] derived from targets.ts
  targets.ts              # the single registry of apps under test
  tests/
    sync-blog.spec.ts     # runs against the 4 blog projects (shared examples-shared selectors)
    sync-todos.spec.ts    # runs against templates/vite
  fixtures/
    two-clients.ts        # helper: open two browser contexts on the same baseURL
    selectors.ts          # shared selector/text constants per capability
  README.md
```

### `targets.ts` — single source of truth

Each entry drives both a Playwright `project` and a `webServer`:

```ts
type Target = {
  name: string; // "next-blog"
  filter: string; // pnpm --filter name, e.g. "next-blog"
  capability: "sync-blog" | "sync-todos";
  port: number; // fixed, unique HTTP port
  startCmd: string; // production start/preview command (no build)
  env?: Record<string, string>;
};
```

Fixed ports (no collisions when all run together):

| App                 | pkg name (`--filter`)    | HTTP port | Start command | Notes                          |
| ------------------- | ------------------------ | --------- | ------------- | ------------------------------ |
| next-blog           | `rxfy-example-next-blog` | 4301      | `... start`   | `server.mts` reads `PORT`      |
| rr7-blog            | `rxfy-example-rr7-blog`  | 4302      | `... start`   | `server.mts` reads `PORT`      |
| vite-blog-framework | `vite-blog-framework`    | 4303      | `... preview` | `server/index.ts` reads `PORT` |
| waku-blog           | `rxfy-example-waku-blog` | 4304      | `... start`   | see waku nuance below          |
| vite (template)     | `rxfy-template-vite`     | 4305      | `... preview` | `server/index.ts` reads `PORT` |

The e2e package itself is named `rxfy-e2e` (private).

**Waku nuance:** `waku-blog/src/blog/sync-client.ts` **hardcodes** the browser WS port to `8090`.
The server reads `RXFY_WS_PORT` (default `8090`). Therefore waku's webServer must leave
`RXFY_WS_PORT` at its default `8090` (only the HTTP `PORT` is parametrized), and — because `8090` is
a fixed singleton — only one waku instance runs at a time (it does; one project). This is the one
app whose WS port is not freely assignable; captured here so the implementer doesn't fight it.

### `playwright.config.ts`

- `projects`: one per target. Each sets `use.baseURL = http://localhost:<port>`,
  `metadata.capability`, and `testMatch` so the project runs only its capability's spec
  (`sync-blog` projects → `sync-blog.spec.ts`; `sync-todos` → `sync-todos.spec.ts`).
- `webServer`: array built from `targets`, each `{ command: startCmd, url: baseURL, env: { PORT },
reuseExistingServer: !CI, timeout: 120_000 }`. Playwright boots each once and reuses it across the
  project's tests.
- `use.trace: "on-first-retry"`, `retries: process.env.CI ? 2 : 0`, Chromium project device only.
- Servers serve **production builds**; Playwright does **not** build (see build strategy).

### Build strategy (production, turbo-cached)

The apps are built by turbo (cached), not by Playwright, so `webServer` commands only `start`/`preview`:

1. Root script `test:e2e` → `turbo run e2e`.
2. New turbo `e2e` task lives in `examples/e2e`, `dependsOn: ["^build"]`, `cache: false`. `^build`
   builds the rxfy libs **and** the example/template apps (they have `build` tasks in the graph).
3. `examples/e2e/package.json`'s `e2e` script = `playwright test`. By the time it runs, every app's
   production artifact exists, so `start`/`preview` boots instantly.

To make `^build` include the apps, `examples/e2e` declares a dev dependency (or turbo `dependsOn`
via `//#e2e` pinning) on each target app package. Simplest: add the five apps as `devDependencies`
(`"next-blog": "workspace:*"` etc.) of `examples/e2e` so they land in its `^build` closure. (This is
private infra, so a workspace dep on private apps is fine — cf. examples-shared conventions.)

All apps use **PGlite (in-memory Postgres)** — servers are self-contained, no external DB, fresh
seed per boot.

## Test scenarios — the sync behavior locked down

### `sync-blog.spec.ts` (runs 4×, the core regression net)

Selectors come from `examples-shared` components (identical across the 4 apps):
`UpdatesBadge` renders a button reading `"{n} new comment{s} · refresh"`; `AddCommentForm`,
`CommentItem`, `PostDetail` provide the rest. Exact selectors resolved during implementation
(prefer role/text; add `data-testid` to `examples-shared` only if text is too brittle).

1. **Live comment badge → apply.**
   - Open post-detail for a seeded post in **context A** and **context B** (two browser contexts,
     same server → same WS hub).
   - In **B**, submit a comment via `AddCommentForm`.
   - **A** shows `UpdatesBadge` "1 new comment · refresh" (driven by `updatesAvailable$` via the
     touched channel — the stale bump).
   - **A** clicks refresh → `applyUpdates()` → the new comment text appears in A's `CommentItem`
     list, badge disappears.
   - This is the exact `touch → stale → updatesAvailable$ → applyUpdates` path.

2. **Live entity patch.**
   - **A** views a post; **B** edits that post's title (via the app's edit action / API).
   - **A**'s rendered title updates **live, with no badge and no refresh** — the entity-topic
     `patch` lands straight in A's model store.

### `sync-todos.spec.ts` (templates/vite)

Selectors: `.updates-badge` button reading `"{n} new — refresh"`; the add form
(`input[placeholder="What needs doing?"]` + Add button); `<li>` todo items with checkboxes.

1. **Live todo badge → apply.** Context B adds a todo → A's `.updates-badge` shows "1 new —
   refresh" → A clicks it → the todo appears in A's list.
2. **Live toggle.** B toggles a todo's checkbox → A reflects the new checked state live (entity
   patch). _(Include only if the app patches todo entities live; otherwise drop to keep the spec
   honest — verify during implementation.)_

## CI / release wiring

- Playwright browsers installed in CI: `pnpm --filter rxfy-e2e exec playwright install --with-deps
chromium` (Chromium only).
- `turbo run e2e` added as a **required gate in the release CI workflow before publish**, so a sync
  regression blocks the release — the stated goal.
- Locally: `pnpm test:e2e` (full), `pnpm --filter rxfy-e2e test:ui` (Playwright UI mode),
  `pnpm --filter rxfy-e2e test --project=<app>` (single app).

## Open questions / verify during implementation

1. **Post edit surface for scenario 2.** Confirm each blog app exposes a title-edit action reachable
   in the browser (vite-blog-framework has `EditPostForm`/`PostActions`; verify next/rr7/waku parity).
   If an app lacks a browser edit path, drive the patch via its `PATCH /api/posts/:id` endpoint from
   the test (still a real cross-client patch) rather than skipping the assertion.
2. **Selector stability.** Decide role/text vs. adding `data-testid` to `examples-shared`. Prefer no
   markup changes; add testids only if text matching proves flaky.
3. **Waku HTTP port.** Confirm `waku start` honors `PORT` (or its documented env) for the HTTP port
   while WS stays on 8090.
4. **`sync-todos` live toggle.** Confirm templates/vite patches todo entities to other clients before
   asserting scenario 2.

## Success criteria

- `pnpm test:e2e` green from a clean checkout after `turbo build`.
- Deliberately breaking the sync path (e.g. dropping the `touch` on comment create) turns the
  relevant `sync-blog` test red — the suite actually detects sync regressions.
- Runs in CI as a pre-publish gate.
