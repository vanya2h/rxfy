---
name: rxfy-setup
description: Use when getting rxfy INTO a project — installing rxfy, starting a new rxfy app, adding rxfy to an existing React app or monorepo package, scaffolding from a create-rxfy-app template, choosing an integration depth (client store, +SSR, +sync), or leveling up an existing rxfy app (adding SSR or sync). Auto-detects empty-dir vs existing-app vs monorepo and routes with the fewest questions, gives the exact install commands, records the chosen variant, then hands off to the `rxfy` skill for the actual model/state/SSR/sync wiring. (For working in an app that already has rxfy installed and set up, use the `rxfy` skill instead.)
license: MIT
metadata:
  author: vanya2h
  version: "1.0.0"
---

# rxfy-setup

Get rxfy **into** a project. This skill owns one decision — _how_ rxfy enters the codebase — plus the exact install commands. Once rxfy is installed, the wiring (models, states, hooks, SSR, sync) belongs to the **`rxfy` skill**; this skill hands off to it and stops.

There is one framework adopted at progressive depths — **Store → +SSR → +Sync** — reached two ways:

- **New project** → scaffold a `create-rxfy-app` template already wired to a depth.
- **Existing React app** → install packages and adopt a depth incrementally, stopping at any level.

## Detect the situation — decide automatically, ask only when ambiguous

Do not ask "template or existing app?" outright. **Detect from the workspace first** and only ask the questions the detection genuinely leaves open. Run:

```bash
ls -A                                    # is the target dir empty?
cat package.json 2>/dev/null             # exists? has a "workspaces" field?
ls pnpm-workspace.yaml turbo.json lerna.json 2>/dev/null   # monorepo markers
```

Route by what you find:

| Detected                                                                            | Do                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Empty dir / no `package.json`**                                                   | New project → `references/from-template.md`. Ask only the app name + which depth (→ template).   |
| **Non-empty, single package** (has `package.json`, no `workspaces`/monorepo marker) | **Automatically** the existing-app path → `references/existing-app.md`. Do not offer a template. |
| **Monorepo** (`workspaces`, `pnpm-workspace.yaml`, `turbo.json`, or `lerna.json`)   | Ask: **add a new package** to the monorepo, or **add rxfy to an existing package?** See below.   |

**Monorepo — new package:** scaffold a new workspace package for the app, then follow `references/existing-app.md` to install rxfy into it at the chosen depth (a template is usually the wrong fit inside an existing monorepo — it brings its own toolchain).

**Monorepo — existing package:** list the packages that make sense for rxfy (React apps) and let the user pick. Detect them by scanning each workspace's `package.json` for a `react` dependency:

```bash
grep -rl '"react"' --include=package.json packages apps 2>/dev/null
```

Present those as the candidates (a package with no `react` dep is not a fit — say so). Once picked, follow `references/existing-app.md` inside that package.

**Then — Q: how deep?** For every existing-app case, pick the depth (ask if unclear, but infer from the request — "real-time" ⇒ +Sync, "SSR"/"first paint" ⇒ +SSR, otherwise Store):

- **Store** — client-only normalized reactive state. No server.
- **+SSR** — render first paint on the server, hydrate with no refetch. Same packages as Store.
- **+Sync** — a server that writes and publishes, and a client that subscribes to real-time updates.

If the package **already has rxfy** at some depth, this is a _level-up_ — install only the packages the deeper level adds (see `references/existing-app.md`) and update the recorded variant.

`references/existing-app.md` has the install block for each depth.

## Record the setup variant (do this once, right after install)

So later sessions never have to re-detect the project type, persist the chosen variant to the project. **Ask the user first** where to record it:

- **`CLAUDE.md`** (or `AGENTS.md` / `GEMINI.md` if that's what the repo uses) — recommended; it's loaded every session.
- **Agent memory** — if the user prefers not to touch `CLAUDE.md`.

Then write (or update) exactly this block, filling in the variant:

```md
## rxfy setup

<!-- rxfy-setup:variant -->

- Variant: <one of the below>
```

Variant values:

- `template: vite-spa (Store)` · `template: next (SSR+Sync)` · `template: vite (SSR+Sync)`
- `existing-app, depth: Store` · `existing-app, depth: +SSR` · `existing-app, depth: +Sync`

The `<!-- rxfy-setup:variant -->` marker is what the `rxfy` skill's `orientation.md` looks for; keep it verbatim. If the app later levels up (e.g. Store → +Sync), update this line.

## After install — hand off to the `rxfy` skill

Installation is where this skill ends. You now know the project's entry mode and depth, so you are already oriented — go straight to the **`rxfy` skill** library and read the wiring guide for what you're building:

- Declaring the first model + state → `models-states.md`
- Reading it in React → `react-bindings.md`
- SSR wiring → `ssr.md`
- Sync server / client / grants → `sync-server.md`, `sync-client.md`, `sync-grants.md`
- Working inside a scaffolded template → `templates.md`

Do not re-teach the wiring here; the `rxfy` skill owns it.
