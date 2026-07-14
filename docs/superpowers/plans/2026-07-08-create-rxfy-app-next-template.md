# create-rxfy-app: Next.js template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `next` template to `create-rxfy-app` — a Next.js App Router app wired to rxfy's SSR store via the RSC prefetch pattern (async Server Component → `prefetch()` → `<HydrateSnapshot>` → client `useStateData`), shipped as a near-empty starter and bundled into the CLI at picker `order: 4`.

**Architecture:** A Server Component fetches on the server with an isomorphic `fetchTodos` (direct in-memory store read on the server; `/api/todos` Route Handler on the client), `prefetch()` dehydrates it, `<HydrateSnapshot>` merges the snapshot into the shared registry, and the client `TodosView` reads the already-seeded store with zero first-paint fetch. Writes go through a Server Action, then update the reactive store via the state's `addTodo` mutation. This deliberately uses the RSC seam, **not** `HydrationStream`.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), React 19, rxfy/rxfy-react (workspace), Tailwind v4, eslint-config-next, vitest, TypeScript, pnpm + turbo.

**Reference:** `examples/waku-blog` (`src/ssr.ts`, `src/components/HydrateSnapshot.tsx`) is the proven source of the `prefetch`/`HydrateSnapshot` helpers; `examples/next-blog` is the App Router config reference. Spec: `docs/superpowers/specs/2026-07-08-create-rxfy-app-next-template-design.md`.

**Conventions:**

- Prettier: 120 print width, double quotes, semicolons, trailing commas.
- Commit messages: plain conventional commits, **no Co-Authored-By / AI-attribution trailers**.
- Template source files use **relative imports** with **no import extensions** (Next/bundler resolution), unlike the `.js`/`.ts` extensions in the vite templates.

**Next.js tooling decisions (important — these prevent CI/scaffold breakage):**

- `next dev`/`next build` **generate** `next-env.d.ts` and `.next/`. Both are gitignored in the template and **skipped by `prepare-templates.ts`** so they never get bundled; the scaffolded user's first `next dev` regenerates `next-env.d.ts` for their Next version.
- Because `next-env.d.ts` is not shipped, a committed `src/types/next.d.ts` shim supplies Next's global types so `pnpm check-types` works on a fresh scaffold before the first build.
- `tsconfig.json` pre-includes the `.next/types` globs (harmless when absent) so `next build` does not mutate the committed tsconfig.

---

### Task 1: Skip `.next` and generated `next-env.d.ts` when copying templates

`prepare-templates.ts` (CLI build) and `scaffold.ts` (scaffold time) copy template dirs. Next generates `.next/` (build output) and `next-env.d.ts`; neither should ever be bundled or scaffolded.

**Files:**

- Modify: `packages/create-rxfy-app/scripts/prepare-templates.ts`
- Modify: `packages/create-rxfy-app/src/scaffold.ts`
- Modify: `packages/create-rxfy-app/src/scaffold.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/create-rxfy-app/src/scaffold.test.ts`, extend the fixture and the scaffold assertions. First, in `fixtureTemplatesRoot()`, add these two lines just after the existing `fs.mkdirSync(path.join(dir, "dist"), ...)` line (inside the "junk that must never be copied" section):

```ts
fs.mkdirSync(path.join(dir, ".next", "cache"), { recursive: true });
fs.writeFileSync(path.join(dir, "next-env.d.ts"), '/// <reference types="next" />\n');
```

Then, in the `scaffold` test ("copies files, renames \_gitignore, rewrites the package name, drops junk"), add these two assertions next to the existing `expect(fs.existsSync(path.join(target, "dist"))).toBe(false);`:

```ts
expect(fs.existsSync(path.join(target, ".next"))).toBe(false);
expect(fs.existsSync(path.join(target, "next-env.d.ts"))).toBe(false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter create-rxfy-app test`
Expected: FAIL — `.next` and `next-env.d.ts` are copied into the target, so both `existsSync` assertions return `true`.

- [ ] **Step 3: Implement the skip in `scaffold.ts`**

In `packages/create-rxfy-app/src/scaffold.ts`, change the `SKIP_DIRS` constant and the copy filter. Replace:

```ts
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);
```

with:

```ts
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next"]);
const SKIP_FILES = new Set(["next-env.d.ts"]);
```

Then in the `scaffold` function, replace the `fs.cpSync(templateDir, targetDir, { ... })` filter:

```ts
    filter: (src) => !SKIP_DIRS.has(path.basename(src)) && !src.endsWith(".tsbuildinfo"),
```

with:

```ts
    filter: (src) =>
      !SKIP_DIRS.has(path.basename(src)) && !SKIP_FILES.has(path.basename(src)) && !src.endsWith(".tsbuildinfo"),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter create-rxfy-app test`
Expected: PASS (all tests).

- [ ] **Step 5: Mirror the skip in `prepare-templates.ts`**

In `packages/create-rxfy-app/scripts/prepare-templates.ts`, replace:

```ts
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);
```

with:

```ts
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next"]);
const SKIP_FILES = new Set(["next-env.d.ts"]);
```

Then replace the copy filter:

```ts
    filter: (p) => !SKIP_DIRS.has(path.basename(p)) && !p.endsWith(".tsbuildinfo"),
```

with:

```ts
    filter: (p) => !SKIP_DIRS.has(path.basename(p)) && !SKIP_FILES.has(path.basename(p)) && !p.endsWith(".tsbuildinfo"),
```

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter create-rxfy-app check-types`
Expected: exits 0.

```bash
git add packages/create-rxfy-app/scripts/prepare-templates.ts packages/create-rxfy-app/src/scaffold.ts packages/create-rxfy-app/src/scaffold.test.ts
git commit -m "feat(create-rxfy-app): skip .next and generated next-env.d.ts when copying templates"
```

---

### Task 2: `next` template — package skeleton, data/SSR layer, and smoke test

Create an installable, testable package: config files + the data layer (`store.ts`, `todos.ts`), the `prefetch` SSR helper (`ssr.ts`), and its vitest smoke test. TDD the smoke test. The React/Next app files come in Task 3.

**Files (all Create):**

- `templates/next/template.json`, `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `turbo.json`
- `templates/next/src/types/next.d.ts`
- `templates/next/src/lib/store.ts`, `src/lib/todos.ts`, `src/lib/ssr.ts`
- Test: `templates/next/src/lib/ssr.test.ts`

- [ ] **Step 1: Create the config files**

`templates/next/template.json`:

```json
{
  "order": 4,
  "display": "Next.js (App Router)",
  "description": "SSR store via React Server Components: RSC prefetch + hydrate, isomorphic fetch, server actions"
}
```

`templates/next/package.json`:

```json
{
  "name": "rxfy-template-next",
  "version": "0.0.0",
  "private": true,
  "description": "rxfy + Next.js App Router: SSR store via RSC prefetch and hydrate",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "clean": "rimraf .next",
    "lint": "eslint .",
    "check-types": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "lodash": "^4.17.21",
    "next": "^16.2.9",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.8.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.1",
    "@tailwindcss/postcss": "^4.3.2",
    "@types/lodash": "^4.17.17",
    "@types/node": "^22.15.29",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "eslint": "^9.27.0",
    "eslint-config-next": "^16.2.9",
    "rimraf": "^6.0.1",
    "tailwindcss": "^4.3.2",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

`templates/next/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`templates/next/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`templates/next/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
});
```

`templates/next/postcss.config.mjs`:

```mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`templates/next/eslint.config.mjs`:

```mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "node_modules/**"] },
];

export default eslintConfig;
```

`templates/next/.gitignore`:

```
node_modules
.next/
next-env.d.ts
*.tsbuildinfo
.env*
```

`templates/next/turbo.json` (overrides `test` to depend only on dependency builds — the vitest test is node-only and does not need `next build`):

```json
{
  "extends": ["//"],
  "tasks": {
    "build": { "outputs": [".next/**", "!.next/cache/**"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 2: Create the Next global-types shim**

`templates/next/src/types/next.d.ts`:

```ts
// Provides Next.js global types to `tsc` before `next dev`/`next build` generates next-env.d.ts.
// Next manages next-env.d.ts (gitignored); this committed shim keeps `pnpm check-types` working
// on a fresh scaffold. Safe to delete once you have run the app once.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 3: Create the data layer**

`templates/next/src/lib/todos.ts`:

```ts
import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

// Entities normalize into a shared store keyed by id — every subscriber to an id re-renders on change.
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

// The page's state over that store: data$ emits { todos: string[] } (ids); entities resolve from the store.
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});

// Isomorphic fetcher: on the server it reads the in-memory store directly (like hitting your DB);
// on the client it goes over HTTP to the route handler. The same function feeds both the RSC
// prefetch (server) and useStateData refetches (client).
export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  if (typeof window === "undefined") {
    const { listTodos } = await import("./store");
    return { todos: listTodos() };
  }
  const res = await fetch("/api/todos");
  if (!res.ok) throw new Error("Failed to load todos");
  return (await res.json()) as { todos: Todo[] };
}
```

`templates/next/src/lib/store.ts`:

```ts
import type { Todo } from "./todos";

// In-memory stand-in for a real backend: read directly on the server (see fetchTodos), exposed to the
// client via the /api/todos route handler, and written by the createTodo server action. NOTE: this
// resets when the server restarts and is not shared across processes — swap in a real database.
const globalForStore = globalThis as unknown as { __rxfyTodos?: Todo[]; __rxfyNextId?: number };

const todos: Todo[] = (globalForStore.__rxfyTodos ??= [
  { id: "1", title: "Replace lib/store.ts with a real database", done: false },
  { id: "2", title: "Read https://rxfy.vanya2h.me", done: false },
]);
globalForStore.__rxfyNextId ??= todos.length + 1;

export function listTodos(): Todo[] {
  return todos;
}

export function insertTodo(title: string): Todo {
  const todo: Todo = { id: String(globalForStore.__rxfyNextId!++), title, done: false };
  todos.push(todo);
  return todo;
}
```

- [ ] **Step 4: Create the SSR prefetch helper**

`templates/next/src/lib/ssr.ts` (copied from `examples/waku-blog/src/ssr.ts`, with an App Router doc comment):

```ts
import {
  createFulfilled,
  createModelRegistry,
  dehydrate,
  type DehydratedState,
  normalizeResult,
  type QueryShapeOf,
  stableStringify,
  type StateDescriptor,
} from "rxfy";

/**
 * Server-side prefetch for the App Router. RSC has no script-injection seam, so we produce the
 * dehydrated snapshot before render and pass it down as a serializable prop (see app/page.tsx).
 * Runs the fetcher into a fresh per-request registry, normalizes the result, seeds the query cache
 * under the same key useStateData uses, and returns the snapshot for HydrateSnapshot to ingest.
 */
export async function prefetch<TParams, TShape>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- leave the state's query/writable shapes open so plain-object fields aren't re-derived through QueryShapeOf<TShape>
  state: StateDescriptor<TParams, TShape, any, any, any>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): Promise<DehydratedState> {
  const registry = createModelRegistry();
  const result = await fetchFn(params, new AbortController().signal);
  const ids = normalizeResult(registry, state.fields, result);
  registry.queries.getQuery<QueryShapeOf<TShape>>(`${state.key}:${stableStringify(params)}`).set(createFulfilled(ids));
  return dehydrate(registry);
}
```

- [ ] **Step 5: Write the failing smoke test**

`templates/next/src/lib/ssr.test.ts`:

```ts
import { StatusEnum } from "rxfy";
import { describe, expect, it } from "vitest";
import { prefetch } from "./ssr";
import { fetchTodos, todosState } from "./todos";

describe("prefetch (SSR round-trip)", () => {
  it("dehydrates the todos query as FULFILLED with entities in the model store", async () => {
    const snapshot = await prefetch(todosState, fetchTodos, {});

    // The query is keyed `${state.key}:${stableStringify(params)}` — here "todos:{}".
    const query = snapshot.queries["todos:{}"];
    expect(query).toBeDefined();
    expect(query.type).toBe(StatusEnum.FULFILLED);

    // The query holds ids, not entities...
    const value = (query as { type: StatusEnum.FULFILLED; value: { todos: string[] } }).value;
    expect(value.todos.length).toBeGreaterThan(0);

    // ...and the entities live in the model store keyed by the model name ("todo").
    expect(Object.keys(snapshot.models.todo ?? {}).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Install and run the test to verify it fails, then passes**

Run: `pnpm install` (from repo root — registers the new workspace package). If `rxfy`/`rxfy-react` dist is missing, run `pnpm turbo build --filter rxfy-react` first.

Run: `pnpm --filter rxfy-template-next test`
Expected: PASS (1 test). The test exercises `fetchTodos` in node (window undefined → server branch → reads `store.ts`), normalization, query-cache seeding, and dehydration.

> Note on TDD: because the helper files are created before the test in this task, run the test once and confirm it passes; if it fails, the failure output points at the real defect (wrong key, wrong status field) — fix the implementation, not the assertion.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter rxfy-template-next check-types`
Expected: exits 0. (The `src/types/next.d.ts` shim supplies Next globals; app files don't exist yet but the lib/config files typecheck.)

- [ ] **Step 8: Commit**

```bash
git add templates/next pnpm-lock.yaml
git commit -m "feat(create-rxfy-app): next template — data layer, SSR prefetch helper, smoke test"
```

---

### Task 3: `next` template — App Router app and React components

Add the Next app shell and the RSC/client component wiring on top of Task 2's data layer.

**Files (all Create):**

- `templates/next/src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `templates/next/src/app/api/todos/route.ts`
- `templates/next/src/providers.tsx`
- `templates/next/src/components/HydrateSnapshot.tsx`, `src/components/TodosView.tsx`
- `templates/next/src/lib/actions.ts`
- `templates/next/README.md`

- [ ] **Step 1: Create the providers and layout**

`templates/next/src/providers.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { StoreProvider } from "rxfy-react";

export function RxfyProvider({ children }: { children: ReactNode }) {
  return <StoreProvider ssr>{children}</StoreProvider>;
}
```

`templates/next/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RxfyProvider } from "../providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "rxfy + Next.js",
  description: "Next.js App Router starter using rxfy for normalized reactive state",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RxfyProvider>{children}</RxfyProvider>
      </body>
    </html>
  );
}
```

`templates/next/src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
}

body {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}
```

- [ ] **Step 2: Create the snapshot hydrator**

`templates/next/src/components/HydrateSnapshot.tsx` (copied from `examples/waku-blog/src/components/HydrateSnapshot.tsx`):

```tsx
"use client";

import { useState } from "react";
import { type DehydratedState, hydrate } from "rxfy";
import { useModelRegistry } from "rxfy-react";

/**
 * Merges a server-produced snapshot into the provider's shared registry exactly once
 * (the useState initializer runs once per mount, on both SSR and client). Rendered before
 * the data-reading components so the store is populated when they read.
 */
export function HydrateSnapshot({ snapshot }: { snapshot: DehydratedState }) {
  const registry = useModelRegistry();
  useState(() => {
    hydrate(registry, snapshot);
    return null;
  });
  return null;
}
```

- [ ] **Step 3: Create the server action**

`templates/next/src/lib/actions.ts`:

```ts
"use server";
import { insertTodo } from "./store";
import type { Todo } from "./todos";

// Server Action — the real-world write path. Persists to the backend (here, the in-memory store)
// and returns the created entity for the client to fold into its reactive store.
export async function createTodo(title: string): Promise<Todo> {
  return insertTodo(title);
}
```

- [ ] **Step 4: Create the Route Handler**

`templates/next/src/app/api/todos/route.ts`:

```ts
import { listTodos } from "../../../lib/store";

// Backs the client branch of fetchTodos (the server branch reads the store directly).
export function GET() {
  return Response.json({ todos: listTodos() });
}
```

- [ ] **Step 5: Create the client view**

`templates/next/src/components/TodosView.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { createTodo } from "../lib/actions";
import { fetchTodos, todoModel, todosState } from "../lib/todos";

// Subscribes to one entity by id — a store.set for this id re-renders only this item.
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => store.set(todo.id, { ...todo, done: !todo.done })}
          />
          <span className={todo.done ? "line-through opacity-60" : ""}>{todo.title}</span>
        </li>
      )}
    </Pending>
  );
}

export function TodosView() {
  const params = useMemo(() => ({}), []);
  // The store is already seeded by <HydrateSnapshot> from the RSC prefetch, so there is no fetch on first paint.
  const { data$, mutations } = useStateData({ state: todosState, fetchFn: fetchTodos, params });
  const [title, setTitle] = useState("");

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">rxfy todos</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          // Persist through the server action, then fold the created entity into the reactive store.
          void createTodo(next)
            .then((todo) => mutations.addTodo(todo))
            .catch(() => setTitle(next)); // restore the input so a failed create isn't lost
        }}
      >
        <input
          className="flex-1 rounded border px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
        />
        <button className="rounded border px-3 py-1" type="submit">
          Add
        </button>
      </form>
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul className="flex flex-col gap-2">
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </main>
  );
}
```

- [ ] **Step 6: Create the page (async Server Component)**

`templates/next/src/app/page.tsx`:

```tsx
import { HydrateSnapshot } from "../components/HydrateSnapshot";
import { TodosView } from "../components/TodosView";
import { prefetch } from "../lib/ssr";
import { fetchTodos, todosState } from "../lib/todos";

// Server Component: fetch on the server, dehydrate, and pass the snapshot to the client so the
// store is seeded before TodosView reads it. This is the RSC alternative to <HydrationStream />.
export default async function HomePage() {
  const snapshot = await prefetch(todosState, fetchTodos, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <TodosView />
    </>
  );
}
```

- [ ] **Step 7: Create the README**

Create `templates/next/README.md` with this content (the outer fence below is four backticks — write the file with normal three-backtick fences):

````markdown
# rxfy + Next.js (App Router)

A [Next.js](https://nextjs.org) App Router starter wired to [rxfy](https://rxfy.vanya2h.me)'s SSR store using **React Server Components**: a Server Component fetches on the server, dehydrates the result, and hands it to the client, which reads it from a normalized reactive store with zero fetch on first paint.

## Try it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The todo list is server-rendered (view source — the todos are in the HTML), and adding a todo runs a Server Action then updates the store reactively.

## How the SSR store works

- `src/app/page.tsx` — an **async Server Component** calls `prefetch(todosState, fetchTodos, {})` and renders `<HydrateSnapshot>` (seeds the store) before `<TodosView>` (reads it).
- `src/lib/ssr.ts` — `prefetch` runs the fetcher, normalizes into a fresh registry, and returns a serializable snapshot.
- `src/lib/todos.ts` — the model + state + an **isomorphic** `fetchTodos`: reads the in-memory store directly on the server, calls `/api/todos` on the client.
- `src/lib/actions.ts` — a **Server Action** that persists writes; `src/app/api/todos/route.ts` backs the client fetch.
- `src/lib/store.ts` — an in-memory stand-in for a real database. Swap it out.

## Scripts

| Script             | What it does               |
| ------------------ | -------------------------- |
| `pnpm dev`         | Next dev server            |
| `pnpm build`       | Production build           |
| `pnpm start`       | Serve the production build |
| `pnpm test`        | SSR-prefetch smoke test    |
| `pnpm lint`        | ESLint                     |
| `pnpm check-types` | Typecheck                  |

Docs: https://rxfy.vanya2h.me
````

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm --filter rxfy-template-next check-types`
Expected: exits 0.

Run: `pnpm --filter rxfy-template-next lint`
Expected: exits 0 (the single `@typescript-eslint/no-explicit-any` in `ssr.ts` is suppressed with an inline disable; other `no-explicit-any` findings would be warnings, which don't fail the run).

> If lint fails because `eslint-config-next` cannot find the Next app, confirm `src/app/` exists (it does after this task). If it fails on an unexpected error rule, report it — do not blanket-disable rules.

- [ ] **Step 9: Commit**

```bash
git add templates/next
git commit -m "feat(create-rxfy-app): next template — App Router app with RSC prefetch and server action"
```

---

### Task 4: Bundle `next` into the CLI and verify a scaffolded app builds

**Files:**

- Modify: `packages/create-rxfy-app/package.json` (devDependencies)
- Modify: `packages/create-rxfy-app/README.md` (templates table)

- [ ] **Step 1: Register the template as a devDependency**

In `packages/create-rxfy-app/package.json` `devDependencies`, add (alphabetical, after `rxfy-template-vite-spa`):

```json
    "rxfy-template-next": "workspace:*",
```

Then run `pnpm install` from the repo root.

- [ ] **Step 2: Update the README templates table**

In `packages/create-rxfy-app/README.md`, replace the Templates table with:

```markdown
| Name       | Stack                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| `vite-spa` | Client-only Vite + React SPA — one model, one state, no server                              |
| `vite`     | Vite SSR + React Router + Hono + Drizzle/PGlite + rxfy live updates over WebSocket          |
| `next`     | Next.js App Router — SSR store via RSC prefetch + hydrate, isomorphic fetch, server actions |
```

- [ ] **Step 3: Build the CLI and inspect the bundled template**

Run: `pnpm --filter create-rxfy-app build`
Expected: output includes `prepared template: vite`, `prepared template: vite-spa`, and `prepared template: next`.

Verify the bundled `next` template:

- `cat packages/create-rxfy-app/dist/templates/next/package.json` — `rxfy` and `rxfy-react` are real semver (not `workspace:*`).
- `ls packages/create-rxfy-app/dist/templates/next/_gitignore` — exists.
- `ls packages/create-rxfy-app/dist/templates/next/next-env.d.ts 2>/dev/null; echo "exit: $?"` — must NOT exist (skipped); expect exit 2 / "No such file".
- `ls packages/create-rxfy-app/dist/templates/next/.next 2>/dev/null; echo "exit: $?"` — must NOT exist; expect exit 2.
- `ls packages/create-rxfy-app/dist/templates/next/src/types/next.d.ts` — exists (the shim is shipped).

Paste the output of each.

- [ ] **Step 4: Scaffold from the built CLI and verify picker order**

From the scratchpad `/private/tmp/claude-501/-Users-ivankoryakovtsev-Work-rxfy/3e33b89d-9a44-4b7c-9671-19497a00ff94/scratchpad`:

```bash
cd /private/tmp/claude-501/-Users-ivankoryakovtsev-Work-rxfy/3e33b89d-9a44-4b7c-9671-19497a00ff94/scratchpad
node /Users/ivankoryakovtsev/Work/rxfy/packages/create-rxfy-app/dist/index.js next-check --template next --json --full-output
```

Expected: `{ "ok": true, "data": { "projectName": "next-check", "template": "next", ... } }`. Verify `next-check/` has `src/app/page.tsx`, `.gitignore` (not `_gitignore`), no `template.json`, and `package.json` name `next-check`.

Confirm order — run without `--template` in piped mode:

```bash
node /Users/ivankoryakovtsev/Work/rxfy/packages/create-rxfy-app/dist/index.js order-check --json --full-output; echo "exit: $?"
```

Expected: exit 1, code `MISSING_TEMPLATE`, message listing `Available: vite-spa, vite, next` (in that order).

- [ ] **Step 5: Prove `next build` works against the real rxfy packages**

`rxfy`/`rxfy-react` are not yet published to npm, so a scaffolded `npm install` would fail on the rewritten semver deps. Instead validate `next build` on the workspace template, where `workspace:*` resolves locally. This is safe for the repo source: `.next/` and `next-env.d.ts` are gitignored (so no tracked-file changes) and `tsconfig.json` pre-includes the `.next/types` globs (so Next does not rewrite it).

Clean up the scratchpad first: `cd /private/tmp/.../scratchpad && rm -rf next-check order-check`.

Then, from the repo root:

```bash
pnpm --filter rxfy-template-next build
git status --short templates/next
pnpm --filter rxfy-template-next clean
```

Expected: `next build` completes a successful production build (routes for `/` and `/api/todos`); `git status --short templates/next` shows **no** modified tracked files (only untracked `.next/` and `next-env.d.ts`, both gitignored → nothing listed); `clean` removes `.next`. If `git status` shows `templates/next/tsconfig.json` or `templates/next/next-env.d.ts` as modified, report it — the tooling decisions were meant to prevent exactly that.

Paste the tail of the `next build` output and the `git status --short templates/next` result.

- [ ] **Step 6: Run the CLI package checks and commit**

Run: `pnpm --filter create-rxfy-app test && pnpm --filter create-rxfy-app check-types && pnpm --filter create-rxfy-app lint`
Expected: all pass.

```bash
git add packages/create-rxfy-app/package.json packages/create-rxfy-app/README.md pnpm-lock.yaml
git commit -m "feat(create-rxfy-app): bundle the next template"
```

---

### Task 5: Changeset + full verification

**Files:**

- Modify: `.changeset/create-rxfy-app.md`

- [ ] **Step 1: Extend the pending changeset**

`create-rxfy-app` is unreleased (0.0.0) with one pending changeset. Keep the frontmatter (`"create-rxfy-app": minor`) exactly as is; replace the body with:

```markdown
New package: `create-rxfy-app` — scaffold a standalone rxfy app from an official template
(`pnpm create rxfy-app`). Ships three templates: `vite-spa`, a client-only Vite + React SPA
(the simplest rxfy setup); `vite`, a fully SSR'd live todos app (Vite + React Router + Hono +
Drizzle/PGlite + rxfy live updates over WebSocket); and `next`, a Next.js App Router app whose
SSR store is seeded from React Server Components (RSC prefetch + hydrate, isomorphic fetch, server
actions). The picker lists templates in a curated order via an `order` field in each template's
`template.json`.

The CLI is built on incur: interactive clack prompts in a terminal, and a structured JSON/TOON
envelope with stable error codes (`DIR_NOT_EMPTY`, `UNKNOWN_TEMPLATE`, …) when run by agents or
in pipes. Ships built-in `skills add`, `--llms`, and `--mcp` agent integrations. Requires Node 22+.
```

- [ ] **Step 2: Full verification across affected packages**

Run from the repo root (note: this intentionally omits `build` for the `next` template to avoid `next build` mutating the template source — the scaffolded build was validated in Task 4):

```bash
pnpm turbo test check-types lint --filter rxfy-template-next --filter create-rxfy-app
pnpm --filter create-rxfy-app build
```

Expected: all turbo tasks pass; the CLI build prepares all three templates. Confirm `git status` shows no unexpected modifications to `templates/next` tracked files (no dirtied `next-env.d.ts` or `tsconfig.json`).

- [ ] **Step 3: Commit**

```bash
git add .changeset/create-rxfy-app.md
git commit -m "docs: extend create-rxfy-app changeset with the next template"
```
