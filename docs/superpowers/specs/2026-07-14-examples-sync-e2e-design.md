# Playwright e2e for sync examples — design

**Date:** 2026-07-14
**Status:** Approved design, pre-implementation
**Sub-project:** 2 of 2. **Depends on Spec 1** (`2026-07-14-templates-next-sync-upgrade-design.md`)
— `templates/next` must be a sync-todos app before this suite covers it. Build Spec 1 first.
**Goal:** Catch any regression in real-time **sync behavior** across every sync-capable example/template before release, by driving them in a real browser with Playwright.

## Motivation

The repo already has `*.smoke.test.ts` (vitest) that exercise the sync path over an in-memory
socket pair. Those verify the wiring in isolation, but nothing drives the actual apps end to end in
a browser: real HTTP + real WebSocket + real hydration + real React rendering. A sync regression
(badge not appearing, patch not landing, grant renewal broken) would ship undetected. This suite
closes that gap and becomes a release gate.

## Scope

**In scope:**

| App                 | Path                           | Sync stack            | Capability tag |
| ------------------- | ------------------------------ | --------------------- | -------------- |
| next-blog           | `examples/next-blog`           | rxfy-client + rxfy-ws | `sync-blog`    |
| rr7-blog            | `examples/rr7-blog`            | rxfy-client + rxfy-ws | `sync-blog`    |
| vite-blog-framework | `examples/vite-blog-framework` | rxfy-client + rxfy-ws | `sync-blog`    |
| waku-blog           | `examples/waku-blog`           | rxfy-client + rxfy-ws | `sync-blog`    |
| vite (template)     | `templates/vite`               | rxfy-client + rxfy-ws | `sync-todos`   |
| next (template)     | `templates/next`               | rxfy-client + rxfy-ws | `sync-todos`   |

All six apps carry live real-time **sync**. `templates/next` gains it in **Spec 1** (upgraded from
its old SSR/hydrate-only shape to full sync-todos parity with `templates/vite`); this suite assumes
that upgrade has landed.

**Explicitly out of scope** (no live sync):
`examples/vite-ssr-pagination`, `templates/vite-spa`.

The four `sync-blog` apps render **identical UI** from the private `examples-shared` package, so one
parametrized spec runs against all four. `templates/vite` and `templates/next` are both `sync-todos`
and, once their todos UIs expose matching selectors (guaranteed by Spec 1), share **one**
`sync-todos.spec.ts` run against both — mirroring the sync-blog pattern.

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
    sync-todos.spec.ts    # runs against templates/vite AND templates/next (shared selectors)
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

| App                 | pkg name (`--filter`)    | HTTP port | Start command                                                     | Notes                               |
| ------------------- | ------------------------ | --------- | ----------------------------------------------------------------- | ----------------------------------- |
| next-blog           | `rxfy-example-next-blog` | 4301      | `NODE_ENV=production PORT=4301 tsx server.mts` (`start`)          | WS on same port at `/live`          |
| rr7-blog            | `rxfy-example-rr7-blog`  | 4302      | `NODE_ENV=production PORT=4302 tsx server.mts` (`start`)          | WS on same port at `/live`          |
| vite-blog-framework | `vite-blog-framework`    | 4303      | `NODE_ENV=production PORT=4303 tsx ./server/index.ts` (`preview`) | WS on same port at `/live`          |
| waku-blog           | `rxfy-example-waku-blog` | 4304      | `waku start --port 4304` (`start`)                                | WS pinned to **8090** — see below   |
| vite (template)     | `rxfy-template-vite`     | 4305      | `NODE_ENV=production PORT=4305 tsx ./server/index.ts` (`preview`) | WS on same port at `/live`          |
| next (template)     | `rxfy-template-next`     | 4306      | `NODE_ENV=production PORT=4306 tsx server.mts` (`start`)          | WS on same port at `/live` (Spec 1) |

All commands above were run and verified during Spec 1's cross-app survey. Every app also needs
`RXFY_SECRET` set (any non-empty value) so grants sign/verify; pass it in each target's `env`. Waku
uses a `--port` flag (not `PORT`); every other app reads `PORT` from `env`.

The e2e package itself is named `rxfy-e2e` (private).

**Waku nuance:** `waku-blog/src/blog/sync-client.ts` **hardcodes** the browser WS port to `8090`.
The server reads `RXFY_WS_PORT` (default `8090`). Therefore waku's webServer must leave
`RXFY_WS_PORT` at its default `8090` (only the HTTP `PORT` is parametrized), and — because `8090` is
a fixed singleton — only one waku instance runs at a time (it does; one project). This is the one
app whose WS port is not freely assignable; captured here so the implementer doesn't fight it.

### `playwright.config.ts`

- `projects`: one per target. Each sets `use.baseURL = http://localhost:<port>`,
  `metadata.capability`, and `testMatch` so the project runs only its capability's spec
  (`sync-blog` projects → `sync-blog.spec.ts`; `sync-todos` projects → `sync-todos.spec.ts`).
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
via `//#e2e` pinning) on each target app package. Simplest: add the six apps as `devDependencies`
(`"rxfy-example-next-blog": "workspace:*"` etc.) of `examples/e2e` so they land in its `^build`
closure. (This is
private infra, so a workspace dep on private apps is fine — cf. examples-shared conventions.)

All apps use **PGlite (in-memory Postgres)** — servers are self-contained, no external DB, fresh
seed per boot.

## Test scenarios

### Load routes DIRECTLY (SSR), never by client navigation — load-bearing

Every context must open the route under test with `page.goto(directUrl)` — **not** by navigating
from the home page. This is not a stylistic choice: the exact class of bug this suite exists to
catch (Spec 1's `HydrationStream`/`defaultData` grant-subscription failure) is **invisible under
client navigation** and only appears on a direct SSR load. A client-navigated route fetches fresh
(query atom `IDLE` → grant subscribes → live updates work), so a navigation-based test gives a
**false pass**. An SSR-hydrated route may skip the grant subscription entirely. Confirmed empirically
during Spec 1: navigating home→post passed while a direct post load failed on the same broken build.

- **Blog apps:** scout the first post URL once (`a[href^="/posts/"]` on `/`), then `page.goto(thatUrl)`
  independently in **both** contexts A and B.
- **Todos apps:** the single page IS the SSR route — `page.goto(baseURL)` in each context is already a
  direct load.

Assert on both **DOM state** (badge/checkbox/comment text) and, where cheap, that a `subscribe` WS
frame was actually sent on load (`page.on("websocket")` → `framesent` containing `"subscribe"`) — a
zero-subscribe load is the fingerprint of the regression.

### `sync-blog.spec.ts` (runs 4×, the core regression net)

Selectors (confirmed against `examples-shared` during Spec 1, identical across the 4 apps):

- post link on `/`: `a[href^="/posts/"]`
- add-comment form: `input[placeholder="Your name"]`, `textarea[placeholder="Your comment…"]`,
  submit `button:has-text("Post comment")`
- updates badge: a `button` whose text matches `/new comment/i` (renders `"{n} new comment{s} · refresh"`)
- a posted comment shows as its body text somewhere in the thread

Prefer these role/text selectors; add `data-testid` to `examples-shared` only if text proves flaky.

1. **Live comment badge → apply.**
   - Direct-load the same seeded post in **context A** and **context B** (two contexts, one server,
     one WS hub).
   - In **B**, fill name + comment and submit.
   - **A** shows the updates badge (`/new comment/i`) — the `touch → stale → updatesAvailable$` path.
   - **A** clicks the badge → `applyUpdates()` → B's comment text appears in A's thread; badge clears.

That single scenario is the whole `sync-blog` spec. There is intentionally **no blog entity-patch
scenario**: only `vite-blog-framework` exposes `PATCH /api/posts/:id` (it's the full-CRUD app); the
other three blog apps have no post-edit endpoint, so an entity-patch test would not be uniform. The
**entity-patch** sync path is instead covered — uniformly and already-verified — by the `sync-todos`
**live toggle** scenario below. Between the two capability specs, both sync mechanisms are exercised:
channel-stale badge (`sync-blog`) and entity patch (`sync-todos`).

### `sync-todos.spec.ts` (runs 2×: templates/vite + templates/next)

Both todos templates are `sync-todos` and expose the same selectors (parity guaranteed by Spec 1),
so this spec runs against both as separate projects.

Selectors: `.updates-badge` button reading `"{n} new — refresh"`; the add form
(`input[placeholder="What needs doing?"]` + Add button); `<li>` todo items with checkboxes.

Both contexts direct-load `/` (the single page is the SSR route).

1. **Live todo badge → apply.** Context B adds a todo → A's `.updates-badge` shows "1 new — refresh"
   → A clicks it → the todo appears in A's list.
2. **Live toggle — assert on BOTH tabs, including the one that clicked.** Context B toggles a todo's
   checkbox. Assert the new checked state on **A** (cross-client patch) **and on B itself** (the
   toggling tab, which has no optimistic update and relies on the echo patch). Asserting the
   originating tab is the point: Spec 1's bug left the clicking tab un-updated because it never
   subscribed. No refresh — entity patch on `todo:<id>`.

## CI / release wiring

- Playwright browsers installed in CI: `pnpm --filter rxfy-e2e exec playwright install --with-deps
chromium` (Chromium only).
- `turbo run e2e` added as a **required gate in the release CI workflow before publish**, so a sync
  regression blocks the release — the stated goal.
- Locally: `pnpm test:e2e` (full), `pnpm --filter rxfy-e2e test:ui` (Playwright UI mode),
  `pnpm --filter rxfy-e2e test --project=<app>` (single app).

## Open questions / verify during implementation

Most of the original open questions were resolved during Spec 1's cross-app survey:

- **Post edit surface** — resolved: dropped the blog entity-patch scenario (non-uniform endpoint);
  entity patch is covered by `sync-todos` toggle.
- **Waku port** — resolved: `waku start --port <n>`; WS stays on `8090`.
- **`sync-todos` selector parity** — resolved: Spec 1 landed both todos templates with matching
  selectors (`.updates-badge`, `input[placeholder="What needs doing?"]`, `li` checkboxes).

Remaining to verify while implementing:

1. **Selector stability.** Prefer role/text selectors; add `data-testid` to `examples-shared` only if
   text matching proves flaky under CI timing.
2. **All-6-servers boot budget.** Six production servers start concurrently under Playwright's
   `webServer`; confirm the per-server `timeout` (120s) and total suite time are acceptable on CI. If
   too slow, consider sharding by capability or running fewer projects per CI job.
3. **Waku 8090 collision.** Only one waku instance may run (WS pinned to 8090). One project ⇒ fine,
   but ensure nothing else in the suite binds 8090.

## Known noise (do NOT fail the suite on it)

`vite-blog-framework` and `templates/vite` emit a **React #418** hydration warning (an SSR/client
text mismatch, unrelated to sync) on load. Assert only on sync behavior (badges, checkbox/title
state, comment text, subscribe frames) — do **not** assert "no console/page errors", or these two
projects go red for an unrelated reason. (Flagged separately for a future fix.)

## Success criteria

- `pnpm test:e2e` green from a clean checkout after `turbo build`.
- Deliberately breaking the sync path (e.g. dropping the `touch` on comment create) turns the
  relevant `sync-blog` test red — the suite actually detects sync regressions.
- Runs in CI as a pre-publish gate.
