# Vocs Documentation Site — Design

**Date:** 2026-06-13
**Status:** Approved
**Topic:** Set up Vocs as the documentation site for the rxfy monorepo

## Goal

Stand up a [Vocs](https://vocs.dev) documentation site for rxfy as a new workspace
package in the existing Turbo + pnpm monorepo, scaffolded with real initial content
drawn from the existing READMEs (not placeholders).

## Context

- Monorepo: pnpm workspaces (`packages/*`, `examples/*`) + Turborepo.
- The existing root `docs/` directory holds superpowers plans/specs — it is **not** a
  docs site, so Vocs must live elsewhere.
- Library packages: `rxfy` (core), `rxfy-react` (React bindings), `utils`.
- Core concepts (from `CLAUDE.md`): Atom, Edge, Store, Lens, Wrapped, Batcher.
- Existing READMEs (`README.md`, `packages/rxfy`, `packages/rxfy-react`) are the source
  of truth for content.

## Decisions

| Decision | Choice |
|---|---|
| Placement | New `apps/docs` workspace package; add `apps/*` to `pnpm-workspace.yaml` |
| Content depth | Full setup **plus** real initial pages from the READMEs |
| Turbo integration | Standard `build` / `dev` task names (consistent with other packages) |
| Workspace deps | None on rxfy packages — docs are static MDX |

## Architecture

### 1. Placement & workspace

New private package at `apps/docs`. Update `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "examples/*"
  - "apps/*"
```

`apps/docs/package.json` is `"private": true`, no `publishConfig`. Dependencies:
`vocs`, `waku`, `vite`, `react`, `react-dom` (per the official getting-started). It does
**not** depend on the rxfy workspace packages — code samples in the docs are illustrative
MDX text, not executed, so the docs build stays decoupled from library builds.

### 2. Scripts & Turbo integration

`apps/docs/package.json` scripts (standard task names):

```json
{
  "dev": "vocs dev",
  "build": "vocs build",
  "preview": "vocs preview",
  "check-types": "tsc --noEmit"
}
```

- `build` → `vocs build` outputs to `dist/`, already matching `turbo.json` `outputs: ["dist/**"]`. **No `turbo.json` change required.**
- `dev` → covered by the existing `dev` task (`cache: false`, `persistent: true`).
- `check-types` → typechecks `vocs.config.ts`; the `check-types` task already exists.
- No `lint` / `test` scripts — Turbo skips packages that lack them.
- **Accepted caveat:** root `changeset:publish` runs `turbo run build`, so the docs site
  builds during publish. It is fast and isolated; libraries are unaffected.
- `.gitignore`: `dist` and `.turbo` are already ignored globally. Add a `.vocs` cache
  ignore only if Vocs emits one.

### 3. Vocs config & page structure

`apps/docs/vocs.config.ts`:

```ts
import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "rxfy",
  description: "Stream-based state management built on RxJS",
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Getting Started", link: "/getting-started" },
    {
      text: "Core Concepts",
      items: [
        { text: "Atom", link: "/core-concepts/atom" },
        { text: "Edge", link: "/core-concepts/edge" },
        { text: "Store", link: "/core-concepts/store" },
        { text: "Lens", link: "/core-concepts/lens" },
        { text: "Wrapped", link: "/core-concepts/wrapped" },
      ],
    },
    { text: "Server-Side Rendering", link: "/ssr" },
  ],
});
```

Pages under `apps/docs/src/pages/` (the layout used by the current Waku/Vite-based Vocs
in the official getting-started):

```
src/pages/
├── index.mdx                  # Introduction — README intro + quick taste
├── getting-started.mdx        # Install + minimal usage
├── core-concepts/
│   ├── atom.mdx
│   ├── edge.mdx
│   ├── store.mdx
│   ├── lens.mdx
│   └── wrapped.mdx
└── ssr.mdx                    # SSR modes, from README + rxfy-react SSR docs
```

Content is adapted from `README.md`, `packages/rxfy/README.md`, and
`packages/rxfy-react/README.md` — accurate prose and real code samples, no placeholders.

### 4. tsconfig

`apps/docs/tsconfig.json` extends the shared React preset, mirroring `rxfy-react`:

```json
{
  "extends": "@vanya2h/typescript-config/react",
  "compilerOptions": { "noEmit": true },
  "include": ["./**/*.ts", "./**/*.tsx", "./vocs.config.ts"],
  "exclude": ["./node_modules/**/*", "./.turbo/**/*", "./dist/**/*"]
}
```

## Verification

1. `pnpm install` resolves the new package.
2. `pnpm --filter docs dev` serves the site at `http://localhost:5173` with every sidebar
   page rendering.
3. `pnpm --filter docs build` produces `dist/` with no errors.
4. `turbo build` succeeds across the whole repo (docs included, libraries unaffected).

## Out of scope

- Deployment / hosting (CI publish of the static site).
- Custom theming, logo, social cards beyond Vocs defaults.
- API reference autogeneration from source (`twoslash`, typedoc, etc.).
- Versioned docs.
```