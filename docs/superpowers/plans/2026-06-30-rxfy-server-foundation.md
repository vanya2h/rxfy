# rxfy-server Foundation (topic-key + state-channel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `rxfy-server` package and implement its two pure, zero-runtime-dependency modules: `topic-key.ts` (the windowed HMAC topic-id deriver behind capability auth) and `state-channel.ts` (the `invalidationChannel` derivation that drops pagination/window params).

**Architecture:** `topic-key.ts` derives an opaque, unguessable id for a topic via `HMAC-SHA256(secret, topic + windowId)` using `node:crypto`, with an injectable clock for deterministic tests; it exposes `current(topic)` and `forPublish(topic)` (current + previous window, for boundary coverage). `state-channel.ts` derives a deterministic invalidation-channel string from a state's `key` and `params`, excluding the params named in the state's `window`. Both are pure and unit-testable in isolation; later plans add the Drizzle-backed `resource.ts`, the `hub`, the write functions, and `grant`.

**Tech Stack:** TypeScript, tsup (dual ESM+CJS), Vitest 3, `node:crypto` (built-in). No third-party runtime dependencies in this plan.

This is Plan 2 of the rxfy live framework (after `rxfy-protocol`). It implements parts of design spec §5.5 (`createTopicKeyer`) and §5.2 (`invalidationChannel`, window/partition split) from `docs/superpowers/specs/2026-06-30-rxfy-server-design.md`. Work happens on branch `feat/rxfy-server-framework`, which already contains the completed `rxfy-protocol` package.

---

## File Structure

| File                                             | Responsibility                                                |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `packages/rxfy-server/package.json`              | Package manifest — `.` export, no runtime deps yet            |
| `packages/rxfy-server/tsconfig.json`             | Extends repo shared node tsconfig                             |
| `packages/rxfy-server/config.ts`                 | tsup path config (mirrors `packages/rxfy/config.ts`)          |
| `packages/rxfy-server/tsup.config.ts`            | Build config                                                  |
| `packages/rxfy-server/vitest.config.ts`          | Vitest node + globals                                         |
| `packages/rxfy-server/eslint.config.ts`          | Lint config                                                   |
| `packages/rxfy-server/src/topic-key.ts`          | `createTopicKeyer`, `TopicKeyer`, `TopicKeyerConfig`          |
| `packages/rxfy-server/src/state-channel.ts`      | `invalidationChannel`, `WindowSpec`, `StateChannelDescriptor` |
| `packages/rxfy-server/src/index.ts`              | Barrel re-export                                              |
| `packages/rxfy-server/src/topic-key.test.ts`     | Tests for the keyer                                           |
| `packages/rxfy-server/src/state-channel.test.ts` | Tests for channel derivation                                  |

---

## Task 1: Scaffold the `rxfy-server` package

**Files:**

- Create: `packages/rxfy-server/package.json`
- Create: `packages/rxfy-server/tsconfig.json`
- Create: `packages/rxfy-server/config.ts`
- Create: `packages/rxfy-server/tsup.config.ts`
- Create: `packages/rxfy-server/vitest.config.ts`
- Create: `packages/rxfy-server/eslint.config.ts`
- Create: `packages/rxfy-server/src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rxfy-server",
  "version": "0.0.0",
  "description": "Server-side live data framework for rxfy",
  "homepage": "https://rxfy.vanya2h.me",
  "bugs": {
    "url": "https://github.com/vanya2h/rxfy/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vanya2h/rxfy.git",
    "directory": "packages/rxfy-server"
  },
  "license": "MIT",
  "author": "hi@vanya2h.me",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "package.json"],
  "scripts": {
    "build": "tsup",
    "check-types": "tsc --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsup --watch --silent",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "prepublishOnly": "pnpm run build",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@vanya2h/eslint-config": "^0.7.0",
    "@vanya2h/typescript-config": "^0.7.0",
    "eslint": "^9.27.0",
    "jiti": "^2.4.2",
    "rimraf": "^6.0.1",
    "tsup": "^8.5.0",
    "vitest": "^3.1.4"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (identical to `packages/rxfy/tsconfig.json`)

```json
{
  "extends": "@vanya2h/typescript-config/node",
  "compilerOptions": {
    "types": ["vitest/globals"]
  },
  "exclude": ["node_modules", "dist", ".turbo"]
}
```

- [ ] **Step 3: Create `config.ts`** (identical to `packages/rxfy/config.ts`)

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";

const currentPath = fileURLToPath(import.meta.url);
const rootDir = path.dirname(currentPath);

export const config = {
  name: pkg.name,
  rootDir: rootDir,
  distDir: path.join(rootDir, "dist"),
  srcDir: path.join(rootDir, "src"),
};
```

- [ ] **Step 4: Create `tsup.config.ts`** (identical pattern to `packages/rxfy/tsup.config.ts`)

```ts
import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig({
  format: ["cjs", "esm"],
  dts: true,
  outDir: config.distDir,
  entry: {
    index: path.join(config.srcDir, "index.ts"),
  },
});
```

- [ ] **Step 5: Create `vitest.config.ts`** (identical to `packages/rxfy/vitest.config.ts`)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 6: Create `eslint.config.ts`** (identical to `packages/rxfy/eslint.config.ts`)

```ts
import { config } from "@vanya2h/eslint-config/base";
import { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**", "*.tsbuildinfo"],
  },
] satisfies Linter.Config[];
```

- [ ] **Step 7: Create placeholder `src/index.ts`**

```ts
export {};
```

- [ ] **Step 8: Install and verify toolchain**

Run: `pnpm install`
Then: `pnpm --filter rxfy-server build && pnpm --filter rxfy-server test && pnpm --filter rxfy-server check-types && pnpm --filter rxfy-server lint`
Expected: build emits `packages/rxfy-server/dist/index.{js,cjs,d.ts,d.cts}`; test passes with "no tests"; check-types exits 0; lint reports no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/rxfy-server pnpm-lock.yaml
git commit -m "chore(rxfy-server): scaffold package"
```

---

## Task 2: `topic-key.ts` — windowed HMAC topic-id deriver

**Files:**

- Create: `packages/rxfy-server/src/topic-key.ts`
- Test: `packages/rxfy-server/src/topic-key.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-server/src/topic-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTopicKeyer } from "./topic-key.js";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("createTopicKeyer.current", () => {
  it("is deterministic for the same topic, window, and secret", () => {
    const a = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    const b = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5500 });
    // 5000 and 5500 are both in window 5 -> same id
    expect(a.current("post:1")).toBe(b.current("post:1"));
  });

  it("differs by topic", () => {
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    expect(k.current("post:1")).not.toBe(k.current("post:2"));
  });

  it("differs by secret", () => {
    const k1 = createTopicKeyer({ secret: "s1", windowMs: 1000, now: () => 5000 });
    const k2 = createTopicKeyer({ secret: "s2", windowMs: 1000, now: () => 5000 });
    expect(k1.current("post:1")).not.toBe(k2.current("post:1"));
  });

  it("produces an opaque base64url id that does not leak the plaintext topic", () => {
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    const id = k.current("post:42");
    expect(id).toMatch(BASE64URL);
    expect(id).not.toContain("post");
    expect(id).not.toContain("42");
  });
});

describe("createTopicKeyer.forPublish", () => {
  it("returns the current and previous window ids", () => {
    let t = 5000; // window 5
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => t });
    const before = k.current("post:1"); // window 5

    t = 6000; // window 6
    const after = k.current("post:1");
    expect(after).not.toBe(before);

    // at window 6, forPublish covers [window 6, window 5]
    expect(k.forPublish("post:1")).toEqual([after, before]);
  });

  it("first element equals current()", () => {
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    expect(k.forPublish("post:1")[0]).toBe(k.current("post:1"));
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/topic-key.test.ts`
Expected: FAIL — cannot resolve `./topic-key.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/rxfy-server/src/topic-key.ts`:

```ts
import { createHmac } from "node:crypto";

export type TopicKeyer = {
  /** The opaque id for `topic` in the current time window. */
  current: (topic: string) => string;
  /** Ids the server should publish on: [current window, previous window] (boundary cover). */
  forPublish: (topic: string) => [string, string];
};

export type TopicKeyerConfig = {
  /** HMAC secret. Never sent to clients. */
  secret: string;
  /** Window length in milliseconds; an id self-expires when the window rolls. */
  windowMs: number;
  /** Injectable clock (defaults to Date.now); used for deterministic tests. */
  now?: () => number;
};

export function createTopicKeyer({ secret, windowMs, now = Date.now }: TopicKeyerConfig): TopicKeyer {
  const idFor = (topic: string, window: number): string =>
    createHmac("sha256", secret).update(`${topic}:${window}`).digest("base64url");

  const windowOf = (t: number): number => Math.floor(t / windowMs);

  return {
    current: (topic) => idFor(topic, windowOf(now())),
    forPublish: (topic) => {
      const w = windowOf(now());
      return [idFor(topic, w), idFor(topic, w - 1)];
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/topic-key.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Lint and type-check, then commit**

Run: `pnpm --filter rxfy-server lint` (run `pnpm --filter rxfy-server lint:fix` if it complains about import order/prettier, then re-run `lint` to confirm clean) and `pnpm --filter rxfy-server check-types` (exit 0).

```bash
git add packages/rxfy-server/src/topic-key.ts packages/rxfy-server/src/topic-key.test.ts
git commit -m "feat(rxfy-server): add windowed HMAC topic-key deriver"
```

---

## Task 3: `state-channel.ts` — invalidation-channel derivation

**Files:**

- Create: `packages/rxfy-server/src/state-channel.ts`
- Test: `packages/rxfy-server/src/state-channel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-server/src/state-channel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { invalidationChannel } from "./state-channel.js";

const postsState = { key: "posts", window: ["page", "sort"] as const };

describe("invalidationChannel", () => {
  it("drops window params so all pages/sorts of a partition share one channel", () => {
    const a = invalidationChannel(postsState, { orgId: "A", page: 3, sort: "top" });
    const b = invalidationChannel(postsState, { orgId: "A", page: 0, sort: "new" });
    expect(a).toBe("posts:orgId=A");
    expect(b).toBe("posts:orgId=A");
    expect(a).toBe(b);
  });

  it("separates different partitions", () => {
    expect(invalidationChannel(postsState, { orgId: "A", page: 1 })).not.toBe(
      invalidationChannel(postsState, { orgId: "B", page: 1 }),
    );
  });

  it("is independent of partition-param key order", () => {
    const s = { key: "posts" };
    expect(invalidationChannel(s, { orgId: "A", team: "X" })).toBe(invalidationChannel(s, { team: "X", orgId: "A" }));
  });

  it("returns just the state key when there are no partition params", () => {
    expect(invalidationChannel({ key: "posts", window: ["page"] }, { page: 2 })).toBe("posts");
    expect(invalidationChannel({ key: "posts" }, {})).toBe("posts");
  });

  it("encodes primitive partition values without quotes", () => {
    expect(invalidationChannel({ key: "items" }, { tier: 2, active: true })).toBe("items:active=true&tier=2");
  });

  it("ignores undefined params", () => {
    expect(invalidationChannel({ key: "posts" }, { orgId: "A", note: undefined })).toBe("posts:orgId=A");
  });

  it("JSON-encodes object-valued partition params deterministically", () => {
    const s = { key: "search" };
    expect(invalidationChannel(s, { filter: { q: "x" } })).toBe('search:filter={"q":"x"}');
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/state-channel.test.ts`
Expected: FAIL — cannot resolve `./state-channel.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/rxfy-server/src/state-channel.ts`:

```ts
/** Names of params that slice *within* a dataset (page, cursor, sort) — excluded from the channel. */
export type WindowSpec = readonly string[];

/** The minimal shape `invalidationChannel` needs from a state descriptor. */
export type StateChannelDescriptor = {
  key: string;
  window?: WindowSpec;
};

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);

/** Deterministic, order-independent encoding of the partition params. */
const stableKey = (params: Record<string, unknown>): string =>
  Object.keys(params)
    .filter((key) => params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${encode(params[key])}`)
    .join("&");

/**
 * Derive the invalidation channel for a state instance. Window dims (page, sort, cursor…) are
 * dropped so every window of the same partition shares one channel. Pure and identical on client
 * and server, so the strings always match.
 */
export function invalidationChannel(state: StateChannelDescriptor, params: Record<string, unknown>): string {
  const windowKeys = new Set<string>(state.window ?? []);
  const partition: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (!windowKeys.has(key)) {
      partition[key] = params[key];
    }
  }
  const suffix = stableKey(partition);
  return suffix ? `${state.key}:${suffix}` : state.key;
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/state-channel.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Lint and type-check, then commit**

Run: `pnpm --filter rxfy-server lint` (lint:fix if needed, then re-lint clean) and `pnpm --filter rxfy-server check-types` (exit 0).

```bash
git add packages/rxfy-server/src/state-channel.ts packages/rxfy-server/src/state-channel.test.ts
git commit -m "feat(rxfy-server): add invalidationChannel derivation"
```

---

## Task 4: Barrel export and full verification

**Files:**

- Modify: `packages/rxfy-server/src/index.ts`

- [ ] **Step 1: Replace the placeholder barrel**

Overwrite `packages/rxfy-server/src/index.ts`:

```ts
export * from "./state-channel.js";
export * from "./topic-key.js";
```

> If the `simple-import-sort/exports` lint rule reorders these two lines alphabetically, that is fine — keep the autofixed order.

- [ ] **Step 2: Full package verification**

Run: `pnpm --filter rxfy-server test && pnpm --filter rxfy-server build && pnpm --filter rxfy-server check-types && pnpm --filter rxfy-server lint`
Expected: all tests pass; build emits `dist/index.{js,cjs,d.ts,d.cts}`; check-types exits 0; lint clean (run lint:fix then re-lint if needed).

- [ ] **Step 3: Verify the built surface is importable**

Run from repo root:

```bash
node --input-type=module -e "import('./packages/rxfy-server/dist/index.js').then(m => { const k = m.createTopicKeyer({ secret: 's', windowMs: 1000, now: () => 5000 }); console.log(typeof k.current('post:1')); console.log(m.invalidationChannel({ key: 'posts', window: ['page'] }, { orgId: 'A', page: 1 })); })"
```

Expected output (two lines):

- `string`
- `posts:orgId=A`

- [ ] **Step 4: Commit**

```bash
git add packages/rxfy-server/src/index.ts
git commit -m "feat(rxfy-server): export topic-key and state-channel"
```

---

## Task 5: Changeset

**Files:**

- Create: `.changeset/rxfy-server-foundation.md`

- [ ] **Step 1: Create the changeset**

Create `.changeset/rxfy-server-foundation.md`:

```md
---
"rxfy-server": minor
---

Add `rxfy-server` foundation: `createTopicKeyer` (windowed HMAC topic-id derivation for capability-based live-update auth) and `invalidationChannel` (window/partition-aware state channel derivation).
```

- [ ] **Step 2: Verify Changesets accepts it**

Run: `pnpm changeset status`
Expected: lists `rxfy-server` at `minor` with no errors.

- [ ] **Step 3: Commit**

```bash
git add .changeset/rxfy-server-foundation.md
git commit -m "chore(rxfy-server): add changeset"
```

---

## Final Verification

- [ ] **Run the package's full pipeline**

Run: `pnpm turbo build test lint check-types --filter=rxfy-server`
Expected: all four tasks succeed.

---

## Self-Review Notes

- **Spec coverage:** Implements §5.5 `createTopicKeyer` (windowed `HMAC-SHA256(secret, topic + window)` ids; `current`/`forPublish` with previous-window boundary cover; opaque base64url) and §5.2 `invalidationChannel` (drops `window` params; deterministic, order-independent partition key; same pure function intended for both client and server). The `now` injection keeps tests deterministic without `Date.now` flakiness.
- **Encoding note:** the spec's illustrative `posts:orgId=A` format is realized by encoding primitive partition values via `String(value)` and objects via `JSON.stringify`. This is deterministic and collision-resistant for a given state's typed params; cross-type collisions (string `"2"` vs number `2`) are out of scope because a state's params have a fixed schema.
- **Out of scope (later plans):** `resource.ts` (Drizzle + drizzle-zod derivation, Plan 3), `hub.ts` + write functions + `grant` (Plan 4), `rxfy-ws` (Plan 5), client wiring + `rxfy-react` + rxfy-core `window` field (Plan 6). No runtime dependencies are added in this plan.
- **Type consistency:** `createTopicKeyer` returns `{ current, forPublish }` with `forPublish` typed `[string, string]`; `invalidationChannel(state, params)` takes `StateChannelDescriptor` (`{ key, window? }`) and `Record<string, unknown>`. These signatures are what Plan 4's `grant`/`touch` and Plan 6's client will consume.
