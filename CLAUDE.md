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

## Architecture

**rxfy** is a pnpm + Turbo monorepo providing a stream-based state management library built on RxJS.

### Packages

| Package | Purpose |
|---|---|
| `packages/rxfy` | Core library — Atom, Edge, Store, Lens, Wrapped |
| `packages/rxfy-react` | React bindings (`useEdge` hook, `<Edge>` component) |
| `packages/utils` | Shared TS utilities |
| `packages/eslint-config` | Shared ESLint 9 flat configs (base / node / react) |
| `packages/typescript-config` | Shared tsconfig presets (base / node / lib / react) |
| `examples/vite-todo` | Demo app |

### Core Concepts (packages/rxfy)

- **Atom** — extends `BehaviorSubject` with synchronous `get()`, `set()`, `modify()`. The fundamental reactive cell.
- **Edge** — wraps async operations; tracks status as a `Wrapped<IDLE|PENDING|FULFILLED|REJECTED, TData>` discriminated union.
- **Store** — hierarchical container composed of Atoms. `.node()` creates nested sub-stores; `.factory()` / `.factoryBatch()` create keyed item factories backed by p-queue for concurrency control.
- **Lens** — functional optics (view + edit) for composing reads/writes into nested state. Uses `lodash.isEqual` for change detection.
- **Wrapped** — the core discriminated union type for async state; drives the status enum pattern used throughout.
- **Batcher** — RxJS operator that batches emissions over a 250 ms window.

### Build System

- **tsup** produces dual ESM + CJS output with `.d.ts` for all library packages.
- **Turbo** task graph: `build` depends on `^build`; `test` depends on `^test` and `build`; `lint` depends on `^lint`.
- **Vitest** 3.x, node environment, globals enabled.
- Peer deps: `rxjs`, `zod`, `lodash` (core); `react` 18+ (react package).
