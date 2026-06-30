# rxfy-protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `rxfy-protocol` — a standalone, zero-runtime-dependency package holding the wire contract (message types, version, constructors, and serialize/parse codec) shared by `rxfy-server`, the live client, and every transport adapter.

**Architecture:** Two source modules. `messages.ts` defines the discriminated unions `ServerMessage` (`patch` | `stale`) and `ClientMessage` (`subscribe` | `unsubscribe`), a frozen `PROTOCOL_VERSION`, plus small constructor helpers. `codec.ts` provides `serialize` (JSON) and two directional, validating parsers (`parseServerMessage`, `parseClientMessage`) that throw `ProtocolError` on malformed input or version mismatch. A barrel `index.ts` re-exports both. The package mirrors the existing `packages/rxfy` build setup exactly (tsup dual ESM+CJS, Vitest globals, the repo's shared eslint/tsconfig).

**Tech Stack:** TypeScript, tsup, Vitest 3, pnpm workspace, Turbo. No runtime dependencies.

This is Plan 1 of 5 (dependency order): **rxfy-protocol** → rxfy-server (pure shared modules) → rxfy-server (hub + writes + grant) → rxfy-ws → client/rxfy-react. Each plan ships independently testable software. This plan implements §5.6 and the `rxfy-protocol` package from the design spec at `docs/superpowers/specs/2026-06-30-rxfy-server-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/rxfy-protocol/package.json` | Package manifest — zero runtime deps, dual ESM/CJS exports |
| `packages/rxfy-protocol/tsconfig.json` | Extends the repo's shared node tsconfig |
| `packages/rxfy-protocol/config.ts` | tsup path config (mirrors `packages/rxfy/config.ts`) |
| `packages/rxfy-protocol/tsup.config.ts` | Build config — emits `dist/index.{js,cjs,d.ts,d.cts}` |
| `packages/rxfy-protocol/vitest.config.ts` | Vitest config — node env, globals |
| `packages/rxfy-protocol/eslint.config.ts` | Lint config (mirrors `packages/rxfy/eslint.config.ts`) |
| `packages/rxfy-protocol/src/messages.ts` | Message unions, `PROTOCOL_VERSION`, constructors |
| `packages/rxfy-protocol/src/codec.ts` | `serialize`, `parseServerMessage`, `parseClientMessage`, `ProtocolError` |
| `packages/rxfy-protocol/src/index.ts` | Barrel re-export |
| `packages/rxfy-protocol/src/messages.test.ts` | Tests for constructors |
| `packages/rxfy-protocol/src/codec.test.ts` | Round-trip + rejection tests |

---

## Task 1: Scaffold the `rxfy-protocol` package

**Files:**
- Create: `packages/rxfy-protocol/package.json`
- Create: `packages/rxfy-protocol/tsconfig.json`
- Create: `packages/rxfy-protocol/config.ts`
- Create: `packages/rxfy-protocol/tsup.config.ts`
- Create: `packages/rxfy-protocol/vitest.config.ts`
- Create: `packages/rxfy-protocol/eslint.config.ts`
- Create: `packages/rxfy-protocol/src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rxfy-protocol",
  "version": "0.0.0",
  "description": "Wire protocol for rxfy live updates",
  "homepage": "https://rxfy.vanya2h.me",
  "bugs": {
    "url": "https://github.com/vanya2h/rxfy/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vanya2h/rxfy.git",
    "directory": "packages/rxfy-protocol"
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
  "files": [
    "dist",
    "package.json"
  ],
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
    "@vanya2h/eslint-config": "^0.4.0",
    "@vanya2h/typescript-config": "^0.4.0",
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

- [ ] **Step 7: Create a placeholder `src/index.ts`** so the build has an entry

```ts
export {};
```

- [ ] **Step 8: Install so the workspace links the new package**

Run: `pnpm install`
Expected: completes without error; `rxfy-protocol` appears in the workspace (no peer-dependency warnings about it).

- [ ] **Step 9: Verify the toolchain works on the empty package**

Run: `pnpm --filter rxfy-protocol build && pnpm --filter rxfy-protocol test && pnpm --filter rxfy-protocol check-types`
Expected: build emits `packages/rxfy-protocol/dist/index.js` (+ `.cjs`, `.d.ts`, `.d.cts`); test prints "no tests" and passes (`--passWithNoTests`); check-types exits 0.

- [ ] **Step 10: Commit**

```bash
git add packages/rxfy-protocol pnpm-lock.yaml
git commit -m "chore(rxfy-protocol): scaffold package"
```

---

## Task 2: Message types, version, and constructors

**Files:**
- Create: `packages/rxfy-protocol/src/messages.ts`
- Test: `packages/rxfy-protocol/src/messages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-protocol/src/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, patch, stale, subscribe, unsubscribe } from "./messages.js";

describe("PROTOCOL_VERSION", () => {
  it("is the literal 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe("message constructors", () => {
  it("patch sets version, kind, and fields", () => {
    expect(patch("post", "1", { id: "1", title: "A" })).toEqual({
      v: PROTOCOL_VERSION,
      kind: "patch",
      name: "post",
      id: "1",
      data: { id: "1", title: "A" },
    });
  });

  it("stale sets version, kind, and channel", () => {
    expect(stale("posts:orgId=A")).toEqual({
      v: PROTOCOL_VERSION,
      kind: "stale",
      channel: "posts:orgId=A",
    });
  });

  it("subscribe carries ids", () => {
    expect(subscribe(["a", "b"])).toEqual({
      v: PROTOCOL_VERSION,
      kind: "subscribe",
      ids: ["a", "b"],
    });
  });

  it("unsubscribe carries ids", () => {
    expect(unsubscribe(["a"])).toEqual({
      v: PROTOCOL_VERSION,
      kind: "unsubscribe",
      ids: ["a"],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter rxfy-protocol exec vitest run src/messages.test.ts`
Expected: FAIL — cannot resolve `./messages.js` / exports not defined.

- [ ] **Step 3: Write `messages.ts`**

Create `packages/rxfy-protocol/src/messages.ts`:

```ts
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// --- Server -> client messages ---

/** Live entity update: holders of `name:id` apply this in place. */
export type PatchMessage = {
  v: ProtocolVersion;
  kind: "patch";
  name: string;
  id: string;
  data: unknown;
};

/** Structural change signal for a state channel: clients increment a local counter. */
export type StaleMessage = {
  v: ProtocolVersion;
  kind: "stale";
  channel: string;
};

export type ServerMessage = PatchMessage | StaleMessage;

// --- Client -> server messages ---

export type SubscribeMessage = {
  v: ProtocolVersion;
  kind: "subscribe";
  ids: string[];
};

export type UnsubscribeMessage = {
  v: ProtocolVersion;
  kind: "unsubscribe";
  ids: string[];
};

export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

export type ProtocolMessage = ServerMessage | ClientMessage;

// --- Constructors ---

export const patch = (name: string, id: string, data: unknown): PatchMessage => ({
  v: PROTOCOL_VERSION,
  kind: "patch",
  name,
  id,
  data,
});

export const stale = (channel: string): StaleMessage => ({
  v: PROTOCOL_VERSION,
  kind: "stale",
  channel,
});

export const subscribe = (ids: string[]): SubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "subscribe",
  ids,
});

export const unsubscribe = (ids: string[]): UnsubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "unsubscribe",
  ids,
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter rxfy-protocol exec vitest run src/messages.test.ts`
Expected: PASS — all 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-protocol/src/messages.ts packages/rxfy-protocol/src/messages.test.ts
git commit -m "feat(rxfy-protocol): add message types, version, and constructors"
```

---

## Task 3: Codec — `serialize` and `parseServerMessage`

**Files:**
- Create: `packages/rxfy-protocol/src/codec.ts`
- Test: `packages/rxfy-protocol/src/codec.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-protocol/src/codec.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ProtocolError, parseServerMessage, serialize } from "./codec.js";
import { patch, stale, subscribe } from "./messages.js";

describe("serialize + parseServerMessage round-trip", () => {
  it("round-trips a patch message", () => {
    const msg = patch("post", "1", { title: "A" });
    expect(parseServerMessage(serialize(msg))).toEqual(msg);
  });

  it("round-trips a stale message", () => {
    const msg = stale("posts:orgId=A");
    expect(parseServerMessage(serialize(msg))).toEqual(msg);
  });
});

describe("parseServerMessage rejects invalid input", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseServerMessage("{not json")).toThrow(ProtocolError);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseServerMessage("42")).toThrow(ProtocolError);
  });

  it("rejects an unsupported version", () => {
    expect(() =>
      parseServerMessage(JSON.stringify({ v: 2, kind: "stale", channel: "c" })),
    ).toThrow(/unsupported protocol version/);
  });

  it("rejects an unknown kind", () => {
    expect(() => parseServerMessage(JSON.stringify({ v: 1, kind: "nope" }))).toThrow(
      /unknown server message kind/,
    );
  });

  it("rejects a patch with missing fields", () => {
    expect(() =>
      parseServerMessage(JSON.stringify({ v: 1, kind: "patch", name: "post" })),
    ).toThrow(ProtocolError);
  });

  it("rejects a stale with a non-string channel", () => {
    expect(() =>
      parseServerMessage(JSON.stringify({ v: 1, kind: "stale", channel: 5 })),
    ).toThrow(ProtocolError);
  });

  it("rejects a client frame (subscribe) as a server message", () => {
    expect(() => parseServerMessage(serialize(subscribe(["a"])))).toThrow(
      /unknown server message kind/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter rxfy-protocol exec vitest run src/codec.test.ts`
Expected: FAIL — cannot resolve `./codec.js`.

- [ ] **Step 3: Write `codec.ts`**

Create `packages/rxfy-protocol/src/codec.ts`:

```ts
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ProtocolMessage,
  type ServerMessage,
} from "./messages.js";

/** Thrown when a payload is not a valid protocol message. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function serialize(message: ProtocolMessage): string {
  return JSON.stringify(message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Parse JSON, require an object, and enforce the protocol version. */
function decode(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProtocolError("invalid JSON");
  }
  if (!isRecord(parsed)) {
    throw new ProtocolError("message must be an object");
  }
  if (parsed.v !== PROTOCOL_VERSION) {
    throw new ProtocolError(`unsupported protocol version: ${String(parsed.v)}`);
  }
  return parsed;
}

export function parseServerMessage(raw: string): ServerMessage {
  const msg = decode(raw);
  switch (msg.kind) {
    case "patch":
      if (typeof msg.name !== "string" || typeof msg.id !== "string") {
        throw new ProtocolError("patch requires string `name` and `id`");
      }
      return { v: PROTOCOL_VERSION, kind: "patch", name: msg.name, id: msg.id, data: msg.data };
    case "stale":
      if (typeof msg.channel !== "string") {
        throw new ProtocolError("stale requires a string `channel`");
      }
      return { v: PROTOCOL_VERSION, kind: "stale", channel: msg.channel };
    default:
      throw new ProtocolError(`unknown server message kind: ${String(msg.kind)}`);
  }
}

export function parseClientMessage(raw: string): ClientMessage {
  const msg = decode(raw);
  switch (msg.kind) {
    case "subscribe":
      if (!isStringArray(msg.ids)) {
        throw new ProtocolError("subscribe requires a string[] `ids`");
      }
      return { v: PROTOCOL_VERSION, kind: "subscribe", ids: msg.ids };
    case "unsubscribe":
      if (!isStringArray(msg.ids)) {
        throw new ProtocolError("unsubscribe requires a string[] `ids`");
      }
      return { v: PROTOCOL_VERSION, kind: "unsubscribe", ids: msg.ids };
    default:
      throw new ProtocolError(`unknown client message kind: ${String(msg.kind)}`);
  }
}
```

> Note: `parseClientMessage` is written here in full (used by Task 4's tests) but is exercised by its own tests in Task 4.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter rxfy-protocol exec vitest run src/codec.test.ts`
Expected: PASS — all round-trip and rejection cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-protocol/src/codec.ts packages/rxfy-protocol/src/codec.test.ts
git commit -m "feat(rxfy-protocol): add serialize and parseServerMessage codec"
```

---

## Task 4: Codec — `parseClientMessage` coverage

**Files:**
- Modify: `packages/rxfy-protocol/src/codec.test.ts` (append a describe block)

`parseClientMessage` already exists from Task 3; this task adds its tests.

- [ ] **Step 1: Append the failing test**

Append to `packages/rxfy-protocol/src/codec.test.ts`:

```ts
import { parseClientMessage } from "./codec.js";
import { unsubscribe } from "./messages.js";

describe("serialize + parseClientMessage round-trip", () => {
  it("round-trips a subscribe message", () => {
    const msg = subscribe(["k7", "9x"]);
    expect(parseClientMessage(serialize(msg))).toEqual(msg);
  });

  it("round-trips an unsubscribe message", () => {
    const msg = unsubscribe(["k7"]);
    expect(parseClientMessage(serialize(msg))).toEqual(msg);
  });
});

describe("parseClientMessage rejects invalid input", () => {
  it("rejects subscribe with non-string ids", () => {
    expect(() =>
      parseClientMessage(JSON.stringify({ v: 1, kind: "subscribe", ids: [1, 2] })),
    ).toThrow(ProtocolError);
  });

  it("rejects subscribe with a non-array ids", () => {
    expect(() =>
      parseClientMessage(JSON.stringify({ v: 1, kind: "subscribe", ids: "nope" })),
    ).toThrow(ProtocolError);
  });

  it("rejects a server frame (stale) as a client message", () => {
    expect(() => parseClientMessage(serialize(stale("c")))).toThrow(
      /unknown client message kind/,
    );
  });
});
```

> The `subscribe`, `serialize`, `stale`, `ProtocolError` imports already exist at the top of the file from Task 3; only `parseClientMessage` and `unsubscribe` are newly imported. Merge the new imports into the existing import statements rather than duplicating them (the linter forbids duplicate imports).

- [ ] **Step 2: Run the test to verify the new cases pass**

Run: `pnpm --filter rxfy-protocol exec vitest run src/codec.test.ts`
Expected: PASS — Task 3 cases plus the 5 new `parseClientMessage` cases all green.

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-protocol/src/codec.test.ts
git commit -m "test(rxfy-protocol): cover parseClientMessage round-trip and rejection"
```

---

## Task 5: Barrel export and full package verification

**Files:**
- Modify: `packages/rxfy-protocol/src/index.ts`

- [ ] **Step 1: Replace the placeholder barrel**

Overwrite `packages/rxfy-protocol/src/index.ts`:

```ts
export * from "./messages.js";
export * from "./codec.js";
```

- [ ] **Step 2: Run the full package test suite**

Run: `pnpm --filter rxfy-protocol test`
Expected: PASS — both `messages.test.ts` and `codec.test.ts`, all green.

- [ ] **Step 3: Build, type-check, and lint the package**

Run: `pnpm --filter rxfy-protocol build && pnpm --filter rxfy-protocol check-types && pnpm --filter rxfy-protocol lint`
Expected: build emits `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`; check-types exits 0; lint reports no errors.

- [ ] **Step 4: Verify the public surface is importable from the build**

Run:
```bash
node --input-type=module -e "import('./packages/rxfy-protocol/dist/index.js').then(m => { const s = m.serialize(m.patch('post','1',{a:1})); console.log(s); console.log(m.parseServerMessage(s).kind); })"
```
Expected: prints the JSON string then `patch`.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-protocol/src/index.ts
git commit -m "feat(rxfy-protocol): export public surface via barrel"
```

---

## Task 6: Changeset

**Files:**
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Create the changeset**

Create `.changeset/rxfy-protocol-initial.md` (per the repo's Changesets convention; `minor` for a new published package, per spec §10):

```md
---
"rxfy-protocol": minor
---

Add `rxfy-protocol`: the standalone, zero-dependency wire contract for rxfy live updates — `ServerMessage`/`ClientMessage` types, `PROTOCOL_VERSION`, message constructors, and `serialize`/`parseServerMessage`/`parseClientMessage` codec.
```

- [ ] **Step 2: Verify Changesets accepts it**

Run: `pnpm changeset status`
Expected: lists `rxfy-protocol` with a `minor` bump and no errors.

- [ ] **Step 3: Commit**

```bash
git add .changeset/rxfy-protocol-initial.md
git commit -m "chore(rxfy-protocol): add changeset"
```

---

## Final Verification

- [ ] **Run the whole repo's checks to confirm nothing else broke**

Run: `turbo build test lint check-types --filter=rxfy-protocol`
Expected: all four tasks succeed for `rxfy-protocol` (and its zero dependencies). If you prefer the full graph: `turbo build test lint check-types` — all packages green.

---

## Self-Review Notes

- **Spec coverage:** Implements §5.6 (wire protocol: `ServerMessage` = `patch`|`stale`, `ClientMessage` = `subscribe`|`unsubscribe`, `PROTOCOL_VERSION`, serialize/parse guards) and the `rxfy-protocol` package row of §7, plus the §10 changeset requirement. The directional parsers enforce the "the only entity-data message is `patch`" and "stale carries no number" decisions. No `resume`/`rev` fields exist, matching the client-side-counter decision.
- **Out of scope (later plans):** `topicId`/keyer, hub, resources, grants, transport, client wiring — none belong in the zero-dep protocol package.
- **Type consistency:** `PROTOCOL_VERSION` is `1 as const`; every constructor and parser stamps `v: PROTOCOL_VERSION`; field names (`name`, `id`, `data`, `channel`, `ids`) are identical across `messages.ts`, `codec.ts`, and all tests.
