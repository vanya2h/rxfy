# Vite SSR Pagination Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `examples/vite-ssr-pagination`, a streaming-SSR Vite app that demonstrates rxfy's paginated, normalized list pattern (Load-more button + infinite-scroll sentinel) over an in-memory users directory.

**Architecture:** Scaffolded from `vite-extra`'s `ssr-react-streaming-ts` template, rewired into the pnpm/Turbo monorepo like the other examples. Page 1 is fetched server-side through `useStateData` (suspends, streams in) and hydrated via a single end-of-stream `hydrationScript`; later pages are fetched client-side and appended with `set`, using an offset-as-cursor derived from the loaded row count (hydration-safe). Entities normalize into a shared `UserModel` store; the query holds only ids.

**Tech Stack:** Vite 8, React 19 (`renderToPipeableStream` streaming), Express 5, rxfy + rxfy-react, RxJS, Zod, tsx, `@vanya2h/eslint-config`.

**Note on TDD:** This repo's example apps ship no unit-test infra; they are verified by `check-types`, `lint`, `build`, and manual run. This plan follows that convention rather than adding Vitest to a single example (YAGNI). The one piece of pure logic (`getUsersPage`) is verified with an inline `tsx -e` assertion in its task.

**Preconditions already done (do NOT redo):**
- The branch is `develop`.
- The template was already scaffolded into `examples/vite-ssr-pagination/` (raw template files present, no monorepo wiring yet, `node_modules` not installed). Task 1 starts from those raw files.

---

### Task 1: Rewire package.json into the monorepo

**Files:**
- Modify: `examples/vite-ssr-pagination/package.json` (full replace)

- [ ] **Step 1: Replace package.json**

```json
{
  "name": "rxfy-example-ssr-pagination",
  "version": "0.1.0",
  "private": true,
  "description": "example vite SSR pagination app (streaming SSR + infinite scroll)",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "check-types": "tsc -b --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsx ./server.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.tsx --outDir dist/server",
    "preview": "cross-env NODE_ENV=production tsx ./server.ts",
    "lint": "eslint .",
    "prepublishOnly": "pnpm run build"
  },
  "devDependencies": {
    "@types/compression": "^1.8.0",
    "@types/express": "^5.0.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vanya2h/eslint-config": "^0.4.0",
    "@vitejs/plugin-react": "^5.2.0",
    "compression": "^1.8.0",
    "cross-env": "^7.0.3",
    "eslint": "^9.27.0",
    "express": "^5.1.0",
    "jiti": "^2.4.2",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.8.2",
    "sirv": "^3.0.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "zod": "^4.4.3"
  }
}
```

- [ ] **Step 2: Install + link the workspace**

Run from repo root: `pnpm install`
Expected: completes without error; `examples/vite-ssr-pagination/node_modules` now links `rxfy`/`rxfy-react` as workspace packages.

- [ ] **Step 3: Commit**

```bash
git add examples/vite-ssr-pagination/package.json pnpm-lock.yaml
git commit -m "chore(example): scaffold vite-ssr-pagination and wire into monorepo"
```

---

### Task 2: TypeScript + ESLint config

**Files:**
- Modify: `examples/vite-ssr-pagination/tsconfig.json`
- Modify: `examples/vite-ssr-pagination/tsconfig.app.json`
- Modify: `examples/vite-ssr-pagination/tsconfig.node.json`
- Create: `examples/vite-ssr-pagination/eslint.config.ts`
- Create: `examples/vite-ssr-pagination/src/vite-env.d.ts`

- [ ] **Step 1: Write tsconfig.json**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Write tsconfig.app.json** (covers browser code + the shared dataset)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src", "shared"]
}
```

- [ ] **Step 3: Write tsconfig.node.json** (covers the server + config files)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts", "eslint.config.ts", "server.ts", "shared"]
}
```

- [ ] **Step 4: Write eslint.config.ts**

```ts
import { config } from "@vanya2h/eslint-config/react";
import { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
```

- [ ] **Step 5: Write src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Commit**

```bash
git add examples/vite-ssr-pagination/tsconfig.json examples/vite-ssr-pagination/tsconfig.app.json examples/vite-ssr-pagination/tsconfig.node.json examples/vite-ssr-pagination/eslint.config.ts examples/vite-ssr-pagination/src/vite-env.d.ts
git commit -m "chore(example): add tsconfig + eslint config for vite-ssr-pagination"
```

---

### Task 3: Shared dataset + paging function

**Files:**
- Create: `examples/vite-ssr-pagination/shared/users.ts`

- [ ] **Step 1: Write shared/users.ts**

```ts
import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  initials: z.string(),
});

export type User = z.infer<typeof UserSchema>;

export interface UsersPage {
  items: User[];
  nextCursor: string | null;
}

const FIRST_NAMES = [
  "Ada", "Bjarne", "Clara", "Dennis", "Edsger", "Frances", "Grace", "Hedy",
  "Ivan", "Joan", "Ken", "Linus", "Margaret", "Niklaus", "Ostara", "Peter",
  "Quentin", "Rasmus", "Sophie", "Tim", "Ursula", "Vint", "Wendy", "Xavier",
  "Yukihiro", "Zara",
];
const LAST_NAMES = [
  "Lovelace", "Stroustrup", "Shannon", "Ritchie", "Dijkstra", "Allen", "Hopper",
  "Lamarr", "Sutherland", "Clarke", "Thompson", "Torvalds", "Hamilton", "Wirth",
  "Kay", "Norvig", "Tarjan", "Lerdorf", "Wilson", "Berners-Lee", "Franklin",
  "Cerf", "Hall", "Sala", "Matsumoto", "Khan",
];

const TOTAL = 200;
const PAGE_SIZE = 20;

/** Deterministic dataset — identical on server and client so SSR hydration matches. */
const USERS: User[] = Array.from({ length: TOTAL }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
  const name = `${first} ${last}`;
  return {
    id: `u${i + 1}`,
    name,
    email: `${first}.${last}.${i + 1}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@rxfy.dev",
    initials: `${first[0]}${last[0]}`,
  };
});

/**
 * Offset-based paging. The cursor is the next offset as a string ("20", "40", …);
 * `null` means "start from the beginning". `nextCursor` is `null` once exhausted.
 */
export function getUsersPage(cursor: string | null, pageSize = PAGE_SIZE): UsersPage {
  const offset = cursor ? Number(cursor) : 0;
  const items = USERS.slice(offset, offset + pageSize);
  const next = offset + pageSize;
  return { items, nextCursor: next < USERS.length ? String(next) : null };
}
```

- [ ] **Step 2: Verify the paging logic inline**

Run from `examples/vite-ssr-pagination`:

```bash
pnpm exec tsx -e "import('./shared/users.ts').then(m => { const a = m.getUsersPage(null); const b = m.getUsersPage(a.nextCursor); const last = m.getUsersPage('180'); console.assert(a.items.length === 20, 'page1 len'); console.assert(a.items[0].id === 'u1', 'first id'); console.assert(a.nextCursor === '20', 'next cursor'); console.assert(b.items[0].id === 'u21', 'page2 first'); console.assert(last.nextCursor === null, 'end cursor'); console.assert(last.items.length === 20, 'last len'); console.log('OK'); })"
```

Expected: prints `OK` with no assertion warnings.

- [ ] **Step 3: Commit**

```bash
git add examples/vite-ssr-pagination/shared/users.ts
git commit -m "feat(example): add users dataset and offset paging"
```

---

### Task 4: Isomorphic fetch client

**Files:**
- Create: `examples/vite-ssr-pagination/src/api.ts`

- [ ] **Step 1: Write src/api.ts**

```ts
import type { UsersPage } from "../shared/users.ts";

/**
 * Fetches one page of users. On the server it calls the in-memory data module
 * directly (no HTTP roundtrip during SSR); in the browser it hits the API route.
 * The dynamic import keeps the dataset out of the client bundle.
 */
export async function fetchUsers(cursor: string | null): Promise<UsersPage> {
  if (typeof window === "undefined") {
    const { getUsersPage } = await import("../shared/users.ts");
    return getUsersPage(cursor);
  }
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`/api/users${qs}`);
  if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
  return (await res.json()) as UsersPage;
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-ssr-pagination/src/api.ts
git commit -m "feat(example): add isomorphic users fetch client"
```

---

### Task 5: rxfy model + state

**Files:**
- Create: `examples/vite-ssr-pagination/src/users.ts`

- [ ] **Step 1: Write src/users.ts**

```ts
import { array, createModel, defineState } from "rxfy";
import { useModelStore } from "rxfy-react";
import { z } from "zod";
import { UserSchema } from "../shared/users.ts";

export const userModel = createModel(UserSchema, { getKey: (u) => u.id, name: "user" });

export const useUserStore = () => useModelStore(userModel);

/** One unfiltered, growing list. Empty params keep the query identity stable so manual `set` accumulates. */
export const usersState = defineState({
  key: "users",
  params: z.object({}),
  model: { users: array(userModel) },
});
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-ssr-pagination/src/users.ts
git commit -m "feat(example): add user model and paginated state"
```

---

### Task 6: UserRow and LoadMoreSentinel components

**Files:**
- Create: `examples/vite-ssr-pagination/src/UserRow.tsx`
- Create: `examples/vite-ssr-pagination/src/LoadMoreSentinel.tsx`

- [ ] **Step 1: Write src/UserRow.tsx**

```tsx
import { useMemo } from "react";
import { Pending } from "rxfy-react";
import { useUserStore } from "./users.ts";

/** Subscribes to a single user entity by id — re-renders only when that user changes. */
export function UserRow({ id }: { id: string }) {
  const store = useUserStore();
  const user$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={user$}>
      {(user) => (
        <li className="user-row">
          <span className="avatar" aria-hidden="true">
            {user.initials}
          </span>
          <span className="user-text">
            <span className="user-name">{user.name}</span>
            <span className="user-email">{user.email}</span>
          </span>
        </li>
      )}
    </Pending>
  );
}
```

- [ ] **Step 2: Write src/LoadMoreSentinel.tsx**

```tsx
import { useEffect, useRef } from "react";

/** Calls `onVisible` whenever it scrolls into view — drives infinite scroll. */
export function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onVisible();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);

  return <div ref={ref} className="sentinel" aria-hidden="true" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add examples/vite-ssr-pagination/src/UserRow.tsx examples/vite-ssr-pagination/src/LoadMoreSentinel.tsx
git commit -m "feat(example): add UserRow and infinite-scroll sentinel"
```

---

### Task 7: Users list (pagination logic)

**Files:**
- Create: `examples/vite-ssr-pagination/src/Users.tsx`

- [ ] **Step 1: Write src/Users.tsx**

```tsx
import { useCallback, useMemo, useRef, useState } from "react";
import { Pending, useStateData } from "rxfy-react";
import { fetchUsers } from "./api.ts";
import { LoadMoreSentinel } from "./LoadMoreSentinel.tsx";
import { UserRow } from "./UserRow.tsx";
import { usersState } from "./users.ts";

export function Users() {
  // Stable params → one query identity → manual `set` accumulates a single list.
  const params = useMemo(() => ({}), []);

  // First page goes through useStateData (SSR'd + cached + hydrated).
  const fetchFirst = useCallback(async () => {
    const page = await fetchUsers(null);
    return { users: page.items };
  }, []);

  const { data$, set } = useStateData(usersState, fetchFirst, params);

  const loading = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // offset === number of rows already loaded (offset-based cursor, hydration-safe:
  // it does not depend on fetchFirst running on the client).
  const loadMore = useCallback(
    async (offset: number) => {
      if (loading.current || !hasMore) return;
      loading.current = true;
      setIsLoading(true);
      try {
        const page = await fetchUsers(String(offset));
        setHasMore(page.nextCursor !== null);
        set((prev) => ({ users: [...prev.users, ...page.items] }));
      } finally {
        loading.current = false;
        setIsLoading(false);
      }
    },
    [set, hasMore],
  );

  return (
    <Pending value$={data$} pending={<p className="status">Loading users…</p>}>
      {({ users }) => (
        <>
          <ul className="user-list">
            {users.map((id) => (
              <UserRow key={id} id={id} />
            ))}
          </ul>
          {hasMore ? (
            <>
              <button className="load-more" onClick={() => loadMore(users.length)} disabled={isLoading}>
                {isLoading ? "Loading…" : "Load more"}
              </button>
              <LoadMoreSentinel onVisible={() => loadMore(users.length)} />
            </>
          ) : (
            <p className="status">That's everyone ({users.length}).</p>
          )}
        </>
      )}
    </Pending>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-ssr-pagination/src/Users.tsx
git commit -m "feat(example): add paginated users list with load-more + infinite scroll"
```

---

### Task 8: App shell + styles

**Files:**
- Create: `examples/vite-ssr-pagination/src/App.tsx` (replace template version)
- Create: `examples/vite-ssr-pagination/src/index.css` (replace template version)
- Delete: `examples/vite-ssr-pagination/src/App.css`
- Delete: `examples/vite-ssr-pagination/src/assets/` (hero.png, react.svg, vite.svg)
- Delete: `examples/vite-ssr-pagination/public/icons.svg`

- [ ] **Step 1: Replace src/App.tsx**

```tsx
import { Users } from "./Users.tsx";

export default function App() {
  return (
    <main className="app">
      <header>
        <h1>Users directory</h1>
        <p className="subtitle">Streaming SSR + normalized pagination with rxfy</p>
      </header>
      <Users />
    </main>
  );
}
```

- [ ] **Step 2: Replace src/index.css**

```css
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0f1115;
  color: #e6e8ec;
}

.app {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem 6rem;
}

header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.subtitle {
  margin: 0 0 1.5rem;
  color: #9aa0aa;
}

.user-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.75rem 1rem;
  background: #181b22;
  border: 1px solid #242833;
  border-radius: 10px;
}

.avatar {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: 0.85rem;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
}

.user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-weight: 600;
}

.user-email {
  color: #9aa0aa;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  text-align: center;
  color: #9aa0aa;
  padding: 1rem;
}

.load-more {
  display: block;
  width: 100%;
  margin: 1rem 0 0;
  padding: 0.75rem 1rem;
  font: inherit;
  font-weight: 600;
  color: #e6e8ec;
  background: #232733;
  border: 1px solid #303544;
  border-radius: 10px;
  cursor: pointer;
}

.load-more:disabled {
  opacity: 0.6;
  cursor: progress;
}

.load-more:hover:not(:disabled) {
  background: #2b3140;
}

.sentinel {
  height: 1px;
}
```

- [ ] **Step 3: Delete template marketing assets**

```bash
cd examples/vite-ssr-pagination
rm -f src/App.css public/icons.svg
rm -rf src/assets
```

Expected: no other source file references these (App.tsx no longer imports them; verified in Task 10 type-check).

- [ ] **Step 4: Commit**

```bash
git add -A examples/vite-ssr-pagination/src examples/vite-ssr-pagination/public
git commit -m "feat(example): add users-directory app shell and styles"
```

---

### Task 9: SSR entries + streaming server + HTML

**Files:**
- Modify: `examples/vite-ssr-pagination/src/entry-server.tsx` (replace)
- Modify: `examples/vite-ssr-pagination/src/entry-client.tsx` (replace)
- Modify: `examples/vite-ssr-pagination/index.html` (add `<!--app-state-->`)
- Create: `examples/vite-ssr-pagination/server.ts`
- Delete: `examples/vite-ssr-pagination/server.js`

- [ ] **Step 1: Replace src/entry-server.tsx**

```tsx
import { StrictMode } from "react";
import { type RenderToPipeableStreamOptions, renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App.tsx";

export function render(_url: string, options?: RenderToPipeableStreamOptions) {
  const registry = createModelRegistry(); // one per request
  const stream = renderToPipeableStream(
    <StrictMode>
      <StoreProvider registry={registry} ssr>
        <App />
      </StoreProvider>
    </StrictMode>,
    options,
  );

  // Call after the React stream finishes — serializes everything fetched during render
  // into a <script> that pushes onto window.__RXFY_SSR__.
  return { ...stream, getState: () => hydrationScript(dehydrate(registry)) };
}
```

- [ ] **Step 2: Replace src/entry-client.tsx**

```tsx
import "./index.css";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import App from "./App.tsx";

// Hydration state arrives via the server-injected window.__RXFY_SSR__ script —
// StoreProvider ingests it automatically.
hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr>
      <App />
    </StoreProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Update index.html** — set the title and add the `<!--app-state-->` marker between the root div and the bootstrap script:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>rxfy — users directory</title>
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <!--app-state-->
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create server.ts** (TypeScript port of the template server with the API route + snapshot injection)

```ts
/* eslint-disable turbo/no-undeclared-env-vars */
import fs from "node:fs/promises";
import { Transform } from "node:stream";
import express from "express";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { getUsersPage } from "./shared/users.ts";

type RenderResult = ReturnType<typeof import("./src/entry-server.ts").render>;
type Render = (url: string, options?: RenderToPipeableStreamOptions) => RenderResult;

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5176;
const base = process.env.BASE || "/";
const ABORT_DELAY = 10000;

const templateHtml = isProduction ? await fs.readFile("./dist/client/index.html", "utf-8") : "";

const app = express();

let vite: import("vite").ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom", base });
  app.use(vite.middlewares);
} else {
  const compression = (await import("compression")).default;
  const sirv = (await import("sirv")).default;
  app.use(compression());
  app.use(base, sirv("./dist/client", { extensions: [] }));
}

// Pagination API — the browser hits this for pages after the first.
app.get("/api/users", (req, res) => {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  res.json(getUsersPage(cursor));
});

app.use("*all", async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, "");

    let template: string;
    let render: Render;
    if (!isProduction) {
      template = await fs.readFile("./index.html", "utf-8");
      template = await vite!.transformIndexHtml(url, template);
      render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render as Render;
    } else {
      // @ts-expect-error — dist artifact has no .d.ts
      render = ((await import("./dist/server/entry-server.js")) as { render: Render }).render;
    }

    let didError = false;
    const { pipe, abort, getState } = render(url, {
      onShellError() {
        res.status(500).set({ "Content-Type": "text/html" }).send("<h1>Something went wrong</h1>");
      },
      onShellReady() {
        res.status(didError ? 500 : 200).set({ "Content-Type": "text/html" });

        const [htmlStart, rest] = template.split("<!--app-html-->");
        const [htmlMiddle, htmlEnd] = rest.split("<!--app-state-->");

        const transformStream = new Transform({
          transform(chunk, encoding, callback) {
            res.write(chunk, encoding);
            callback();
          },
        });
        transformStream.on("finish", () => {
          // snapshot script goes after the app markup, before the client bootstrap script
          res.write(htmlMiddle);
          res.write(getState());
          res.write(htmlEnd);
          res.end();
        });

        res.write(htmlStart);
        pipe(transformStream);
      },
      onError(error) {
        didError = true;
        console.error(error);
      },
    });

    setTimeout(() => abort(), ABORT_DELAY);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.log(err.stack);
    res.status(500).end(err.stack);
  }
});

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
```

- [ ] **Step 5: Delete the template's server.js**

```bash
rm -f examples/vite-ssr-pagination/server.js
```

- [ ] **Step 6: Commit**

```bash
git add -A examples/vite-ssr-pagination/src examples/vite-ssr-pagination/index.html examples/vite-ssr-pagination/server.ts
git rm --cached --ignore-unmatch examples/vite-ssr-pagination/server.js
git commit -m "feat(example): streaming SSR with end-of-stream rxfy snapshot"
```

---

### Task 10: Verify type-check, lint, build

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run from repo root: `pnpm --filter rxfy-example-ssr-pagination check-types`
Expected: exits 0, no errors. (If `verbatimModuleSyntax` flags a value-vs-type import, fix with `import type` and re-run.)

- [ ] **Step 2: Lint**

Run: `pnpm --filter rxfy-example-ssr-pagination lint`
Expected: exits 0, no errors.

- [ ] **Step 3: Build**

Run: `pnpm --filter rxfy-example-ssr-pagination build`
Expected: client + server builds succeed; `dist/client/index.html` and `dist/server/entry-server.js` produced.

- [ ] **Step 4: Commit any fixes** (only if Steps 1–3 required edits)

```bash
git add -A examples/vite-ssr-pagination
git commit -m "fix(example): resolve type-check/lint/build issues"
```

---

### Task 11: Manual run verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run from `examples/vite-ssr-pagination`: `pnpm dev` (background it).
Expected: logs `Server started at http://localhost:5176`.

- [ ] **Step 2: Confirm SSR delivered page 1 (no client refetch on first paint)**

```bash
curl -s http://localhost:5176/ > /tmp/ssr.html
grep -c "user-row" /tmp/ssr.html        # expect 20 (page 1 server-rendered)
grep -c "__RXFY_SSR__" /tmp/ssr.html    # expect >= 1 (snapshot injected)
```

Expected: 20 rendered rows and at least one `__RXFY_SSR__` push in the served HTML.

- [ ] **Step 3: Confirm the API pages**

```bash
curl -s "http://localhost:5176/api/users" | head -c 200          # page 1, nextCursor "20"
curl -s "http://localhost:5176/api/users?cursor=180" | head -c 80 # nextCursor null
```

Expected: first returns 20 items with `"nextCursor":"20"`; second returns `"nextCursor":null`.

- [ ] **Step 4: Stop the dev server.**

- [ ] **Step 5:** No commit (verification only).

---

### Task 12: README

**Files:**
- Modify: `examples/vite-ssr-pagination/README.md` (replace template README)

- [ ] **Step 1: Replace README.md**

````markdown
# rxfy example — SSR pagination

A streaming-SSR Vite app showing rxfy's paginated, normalized list pattern: a users
directory loaded one page at a time via a **Load more** button and an **infinite-scroll**
sentinel.

## Run

```bash
pnpm install      # from the repo root
pnpm --filter rxfy-example-ssr-pagination dev
# http://localhost:5176
```

## How it works

- **Page 1 is server-rendered.** `useStateData(usersState, fetchFirst, params)` fetches the
  first page during SSR; the component suspends and the list streams in. The entities
  normalize into the `userModel` store; the query holds only ids.
- **Later pages are fetched client-side and appended** with `set((prev) => ({ users: [...prev.users, ...page.items] }))`.
  Each new id appends to the query's list; row data lives in the store, so a user returned
  on two pages resolves to one cell.
- **Offset as cursor, derived from the loaded count.** The next offset is simply the number
  of rows already loaded. This is hydration-safe: under SSR, `useStateData` hydrates page 1
  from the cache and does *not* re-run `fetchFirst` on the client, so a cursor stashed during
  the first fetch would be lost. Deriving the offset from the rendered list length works on
  both server and client. Keep this view state out of `params` — stable params are what let
  `set` accumulate one growing list.

## Streaming SSR wiring

The `ssr-react-streaming-ts` server streams with `renderToPipeableStream` + `onShellReady`.
`render()` (in `src/entry-server.tsx`) owns the per-request `ModelRegistry` and returns a
`getState()` that serializes everything fetched during render. After the React stream
finishes, `server.ts` writes one `hydrationScript(dehydrate(registry))` (at the
`<!--app-state-->` marker, before the client bootstrap script); `StoreProvider` drains it on
mount.

### Known limitation

True *per-chunk progressive* hydration — pushing each Suspense boundary's data as it flushes
— is not available here. rxfy's `HydrationStream` relies on Next's `useServerInsertedHTML`
and can't run in a plain Vite server. The markup still streams; only the data snapshot is
sent once, at the end of the stream. A Vite/raw-Node streaming hydration adapter would be a
nice future addition to `rxfy-react`.
````

- [ ] **Step 2: Commit**

```bash
git add examples/vite-ssr-pagination/README.md
git commit -m "docs(example): add vite-ssr-pagination README"
```

---

## Self-Review Notes

- **Spec coverage:** scaffold/rewire (T1–T2), users dataset + paging (T3), isomorphic fetch (T4),
  model+state (T5), UserRow + sentinel (T6), pagination logic with both triggers (T7), app shell +
  styles (T8), streaming SSR + snapshot (T9), README incl. known limitation (T12). Verification gates
  (T10–T11) replace the spec's "Verification" section. No changeset task (out of scope, per spec).
- **Refinement vs. spec:** the cursor is derived from the loaded row count rather than stashed from
  `fetchFirst` (hydration-safe); the spec was updated to match.
- **Type consistency:** `userModel` (lowercase, matching the repo's `todoModel`), `usersState`,
  `fetchUsers(cursor)`, `getUsersPage(cursor)`, `UsersPage { items, nextCursor }`, and `getState()`
  are used consistently across tasks.
- **Port:** 5176 (vite-todo and realtime-todos both use 5175 — 5176 avoids a clash if both run).
