# create-rxfy-app — scaffold CLI and standalone starter templates

**Date:** 2026-07-08
**Status:** Approved

## Problem

The framework path (Vite SSR + Hono + rxfy-server + WS) requires assembling a Vite
build config, an HTML template with `<!--app-html-->` / `<!--app-state-->`
placeholders, static-asset serving, a TS runner for the server, and npm scripts —
and no doc page shows this end to end. The examples only run inside the monorepo
(`workspace:*` deps, `examples-shared` imports), which the docs don't state. This
is the single biggest onboarding hurdle.

## Decision summary

- **Scope:** framework (live) path first, but the architecture supports multiple
  templates from day one (`next`, `react-router`, client-only later).
- **Template source:** hand-maintained `templates/` directory in the monorepo,
  written specifically as lean starters (not derived from `examples/*`).
- **Delivery:** a published `create-rxfy-app` CLI with templates bundled into the
  npm package (create-vite style) — works offline, versioned atomically with each
  release.
- **First template content:** minimal live demo — one vertical slice that
  demonstrates real-time updates on first run, small enough to read in one
  sitting.

## 1. Package and CLI

New published package `packages/create-rxfy-app`:

```bash
pnpm create rxfy-app my-app                # interactive template picker
pnpm create rxfy-app my-app --template vite
```

v1 behavior (deliberately minimal):

1. Prompt for project name and template if not given (`@clack/prompts`).
2. Copy the chosen template into the target directory.
3. Rewrite `package.json` `name` to the project name.
4. Rename `_gitignore` → `.gitignore` (npm strips dotfiles from published
   packages).
5. Print next steps: `cd`, `pnpm install`, `pnpm dev`.

Runtime dependencies: `@clack/prompts`, `picocolors` only. No git init, no
package-manager detection beyond the install hint, no options matrix.

## 2. Templates: workspace members, bundled at publish

- Top-level `templates/` directory, added to `pnpm-workspace.yaml` so
  `turbo build / test / check-types` runs against every template on every PR.
  CI coverage is what keeps hand-maintained templates from drifting.
- Templates are `private: true` and declare rxfy deps as `workspace:*`.
- A prepack step for `create-rxfy-app` copies templates into the package and
  rewrites `workspace:*` to the current published versions, so each CLI release
  atomically pins templates to matching rxfy versions.
- Each template carries a `template.json` (display name, description) that
  drives the CLI picker. Adding a new template = adding a directory; the CLI
  needs no changes.

## 3. First template: `templates/vite`

A stripped-down descendant of `examples/vite-blog-framework`:

- **Server:** Hono (`server/index.ts`, `db.ts`, `live.ts`, `render.ts`,
  `ws.ts`), run with `tsx`.
- **Client/SSR:** Vite SSR entries (`entry-client.tsx`, `entry-server.tsx`),
  `index.html` with `<!--app-html-->` / `<!--app-state-->` placeholders, dual
  client/SSR build scripts (`build:client`, `build:server`), `preview` script.
- **Routing:** React Router (declarative/library mode) as the default routing
  solution, wired for SSR: routes defined in `src/routes.ts(x)`,
  `StaticRouter` (or `createStaticHandler`/`StaticRouterProvider`) in
  `entry-server.tsx`, `BrowserRouter` in `entry-client.tsx`. This replaces the
  hand-rolled navigation the example uses and gives users a familiar,
  extensible routing baseline.
- **SSR compliance (hard requirement):** the template must be fully SSR
  compliant end to end — the server renders the routed page with data already
  resolved (no PENDING flash), dehydrates the per-request registry into
  `<!--app-state-->` via `dehydrate` / `hydrationScript`, and the client
  hydrates with `hydrate` producing zero hydration mismatches. Route-level data
  must resolve on the server (rxfy two-pass render or equivalent) so the
  first-paint HTML contains the todos list, and direct navigation to any route
  URL must server-render correctly (not just `/`). The smoke test asserts
  server-rendered HTML contains the data and the hydration payload.
- **Demo slice:** a `todos` Drizzle table on PGlite (zero DB setup), one model +
  one state, one live resource, and a page with a list + create form that
  live-updates across two browser tabs on first `pnpm dev`.
- **Styling:** plain CSS. No Tailwind, shadcn, or `examples-shared`.
- **Test:** a live smoke test (modeled on the example's `live.smoke.test.ts`)
  so template CI is meaningful.

## 4. Testing, docs, release

- **CI:** templates covered by the workspace task graph; `create-rxfy-app`
  gets unit tests for scaffold logic (copy, rename, `package.json` rewrite)
  against a tmp dir.
- **Docs:** getting-started leads with `pnpm create rxfy-app`; the examples
  page gains a note that `examples/*` only run inside the monorepo.
- **Release:** changeset (`minor`) introducing the new package; existing
  changesets/publish flow unchanged.

## Deferred (out of v1)

- `next`, `react-router` (RR7 framework mode — distinct from the library-mode
  routing inside `templates/vite`), and client-only templates
- git init in the CLI
- full install-and-run e2e in CI (scaffold-logic unit tests only for now)
- telemetry, version-selection flags
