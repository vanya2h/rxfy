# New project — scaffold a template

`create-rxfy-app` scaffolds a standalone app already wired end to end. Pick the template by the depth the app needs.

## Pick the template

| Template (`-t`) | Depth               | Stack                                                                                   |
| --------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `vite-spa`      | Store (client-only) | Vite SPA — one model, one state, `useStateData`, no server                              |
| `next`          | +SSR **and** +Sync  | Next.js App Router — RSC prefetch + hydrate, REST writes, WebSocket sync, signed grants |
| `vite`          | +SSR **and** +Sync  | Vite SSR + React Router + Hono — Drizzle + PGlite, WebSocket sync                       |

Note: `next` and `vite` ship SSR **and** sync together — there is no template that stops at "SSR without sync." If the user wants exactly that middle rung, use the existing-app path (`references/existing-app.md`) instead of a template.

## Scaffold

Ask the user for the app name and package manager if not given, then:

```bash
# npm
npm create rxfy-app@latest my-app -- --template vite-spa

# pnpm
pnpm create rxfy-app my-app --template vite-spa

# yarn
yarn create rxfy-app my-app --template vite-spa
```

`--template` (`-t`) skips the interactive picker. Omit it to let `create-rxfy-app` prompt.

Then:

```bash
cd my-app
pnpm install   # or npm / yarn / bun
pnpm dev
```

## Record the variant, then hand off

Once scaffolded, **record the setup variant** so later sessions skip project-type detection — see the "Record the setup variant" section in `SKILL.md`. The variant here is the template, e.g. `template: vite (SSR+Sync)`.

Then hand off to the **`rxfy` skill**: read its `templates.md` for what this template already wired and where to add the next entity — do not rebuild the store/SSR/sync plumbing the template provides.
