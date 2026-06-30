# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm bootstrap

# Build / test / lint all packages
turbo build
turbo test
turbo lint
turbo check-types

# Run a single package's tests (from repo root)
pnpm --filter rxfy test
pnpm --filter rxfy-react test

# Watch mode for a package
pnpm --filter rxfy dev

# Release workflow
pnpm changeset           # create a changeset
pnpm changeset:version   # bump versions
pnpm changeset:publish   # publish to npm
```

Prettier config: 120 print width, double quotes, semicolons, trailing commas.

After any public API change to a published package (`rxfy`, `rxfy-react`), create a changeset with `pnpm changeset` before opening a PR. Use `minor` for new exports, `patch` for fixes, `major` for breaking changes.

## Architecture

**rxfy** is a pnpm + Turbo monorepo for a minimalistic, RxJS-based library: typed, normalized, reactive state for React, with first-class SSR. Entities live in shared normalized stores keyed by id; each page declares its own state over those stores (the query holds only ids), and both states and stores are serializable.

### Packages

| Package | Purpose |
|---|---|
| `packages/rxfy` | Core library — Atom, Lens, Wrapped, Model/State, ModelStore, normalization, SSR |
| `packages/rxfy-react` | React bindings (`useStateData`, `useModelStore`, `useAtom`, `Pending`, `StoreProvider`; `/next` subpath for streaming SSR) |
| `examples/*`, `apps/docs` | Demo apps and documentation site (private, never published) |

### Core Concepts (packages/rxfy)

- **Atom** — extends `Observable<T>` (backed by a `BehaviorSubject`) with synchronous `get()`, `set()`, `modify()`. The fundamental reactive cell. `createAtom(value)`.
- **Lens** — functional optics (view + edit) for composing reads/writes into nested state; is itself an `IAtom`. Uses `lodash.isEqual` for change detection. `createLens(source$, lens)`, `keyLens(key)`.
- **Wrapped** — the core `IDLE | PENDING | FULFILLED | REJECTED` discriminated union (`IWrapped`, `StatusEnum`) for async state, with `createIdle/createPending/createFulfilled/createRejected` constructors.
- **Model** — an entity type plus a `getKey` id extractor (`createModel`); `array()` / `single()` declare model fields. Entities normalize into a shared `ModelStore` (`get`/`set`/`setMany`/`getValue`/`entity`/`valueEntries`), coordinated by a `ModelRegistry`.
- **State** — `defineState({ key, params, model, mutations })` declares a typed, normalized state shape; the fetch result splits into model stores plus an id-only query shape (`QueryShapeOf`). Backed by a `QueryCache` for SSR dedup.
- **SSR** — `dehydrate` / `hydrate` / `hydrationScript` snapshot a per-request registry into the HTML and rehydrate it on the client.

The React bindings (`packages/rxfy-react`) expose `useStateData`, `useModelStore`, `useModelRegistry`, `useAtom`, `useObservable`, `usePending`, the `Pending` component, and `StoreProvider`; the `rxfy-react/next` subpath adds `<HydrationStream />` for streaming SSR.

### Build System

- **tsup** produces dual ESM + CJS output with `.d.ts` for all library packages.
- **Turbo** task graph: `build` depends on `^build`; `test` depends on `^test` and `build`; `lint` depends on `^lint`.
- **Vitest** 3.x, node environment, globals enabled.
- Peer deps: `rxjs`, `zod`, `lodash` (core); `react` 18+ (react package).
