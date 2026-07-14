# create-rxfy-app: picker order + vite-spa template + slim vite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rollout stages 1–3 of the template-list spec (`docs/superpowers/specs/2026-07-08-create-rxfy-app-templates-design.md`): a curated `order` field for the template picker, a new client-only `vite-spa` template, and slimming the existing `vite` template to one entity / one page.

**Architecture:** Templates live in `templates/<name>/` as pnpm workspace packages (workspace glob `templates/*`); `packages/create-rxfy-app/scripts/prepare-templates.ts` copies them into `dist/templates` at build time, rewriting `workspace:*` deps to published versions and renaming `.gitignore` → `_gitignore`. The CLI discovers templates by reading each directory's `template.json`. The new `vite-spa` template is a plain client-only Vite React SPA using `rxfy` + `rxfy-react` (no SSR, no server): one model, one state with a stub fetch, one mutation, one screen.

**Tech Stack:** TypeScript, Vite 6, React 19, rxfy/rxfy-react (workspace), zod 4, vitest 3, pnpm + turbo.

**Conventions that matter here:**

- Prettier: 120 print width, double quotes, semicolons, trailing commas.
- Commit messages: plain conventional commits, **no Co-Authored-By or AI-attribution trailers**.
- Templates have no eslint config (the existing `vite` template has none) — do not add one.
- Inside `templates/vite` source files, relative imports use `.js` extensions; the new `vite-spa` uses `.ts`/`.tsx` extensions (matches the client-only `examples/vite-todo` reference; both work under `allowImportingTsExtensions`).

---

### Task 1: `order` field in `template.json` + picker sort

The picker currently sorts alphabetically ([scaffold.ts:14](packages/create-rxfy-app/src/scaffold.ts#L14)), which would put future templates in the wrong order (`expo` first, `vite-spa` last). Add an optional numeric `order`; sort by `(order, name)` with missing `order` last.

**Files:**

- Modify: `packages/create-rxfy-app/src/scaffold.ts`
- Modify: `packages/create-rxfy-app/src/scaffold.test.ts`
- Modify: `templates/vite/template.json`

- [ ] **Step 1: Write the failing test**

Add to the `describe("listTemplates", ...)` block in `packages/create-rxfy-app/src/scaffold.test.ts` (after the existing "orders templates by name" test):

```ts
it("sorts by order when present, name otherwise; missing order sorts last", () => {
  const root = path.join(tmp, "ordered-templates");
  const make = (name: string, meta: Record<string, unknown>) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, "template.json"), JSON.stringify(meta));
  };
  make("zz-first", { display: "Z", description: "z", order: 1 });
  make("mm-second", { display: "M", description: "m", order: 2 });
  make("bb-unordered", { display: "B", description: "b" });
  make("aa-unordered", { display: "A", description: "a" });
  expect(listTemplates(root).map((t) => t.name)).toEqual(["zz-first", "mm-second", "aa-unordered", "bb-unordered"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter create-rxfy-app test`
Expected: FAIL — the new test gets `["aa-unordered", "bb-unordered", "mm-second", "zz-first"]` (alphabetical). The three pre-existing `listTemplates` tests and the `scaffold` test must still pass.

- [ ] **Step 3: Implement the sort**

In `packages/create-rxfy-app/src/scaffold.ts`, replace the `TemplateMeta` type and `listTemplates` with:

```ts
export type TemplateMeta = { name: string; display: string; description: string; order?: number };

/** Read every bundled template's `template.json`, keyed by directory name. */
export function listTemplates(templatesRoot: string): TemplateMeta[] {
  if (!fs.existsSync(templatesRoot)) return [];
  return fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(templatesRoot, entry.name, "template.json")))
    .map((entry) => {
      const meta = JSON.parse(fs.readFileSync(path.join(templatesRoot, entry.name, "template.json"), "utf8")) as Omit<
        TemplateMeta,
        "name"
      >;
      return { name: entry.name, ...meta };
    })
    .sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
    );
}
```

(The `scaffold` function below it is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter create-rxfy-app test`
Expected: PASS (all tests, including the pre-existing ones — the first test uses `toEqual` on objects without `order`, which still matches because the fixture's `template.json` has no `order` key so the spread adds nothing).

- [ ] **Step 5: Give the existing vite template its curated position**

Replace the full contents of `templates/vite/template.json` with:

```json
{
  "order": 2,
  "display": "Vite + Hono (live SSR app)",
  "description": "Full live stack: Vite SSR, React Router, Hono, Drizzle + PGlite, real-time updates over WebSocket"
}
```

(`order: 2` — `vite-spa` takes 1; later templates take 3+ per the spec.)

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter create-rxfy-app check-types`
Expected: exits 0.

```bash
git add packages/create-rxfy-app/src/scaffold.ts packages/create-rxfy-app/src/scaffold.test.ts templates/vite/template.json
git commit -m "feat(create-rxfy-app): curated template picker order via template.json order field"
```

---

### Task 2: `vite-spa` template

A client-only Vite React SPA — the "hello rxfy" entry point. One model, one state with a stub fetch, one mutation, one screen. No router, no server, no SSR.

**Files (all Create):**

- `templates/vite-spa/template.json`
- `templates/vite-spa/package.json`
- `templates/vite-spa/index.html`
- `templates/vite-spa/vite.config.ts`
- `templates/vite-spa/vitest.config.ts`
- `templates/vite-spa/tsconfig.json`
- `templates/vite-spa/tsconfig.app.json`
- `templates/vite-spa/tsconfig.node.json`
- `templates/vite-spa/.gitignore`
- `templates/vite-spa/README.md`
- `templates/vite-spa/src/main.tsx`
- `templates/vite-spa/src/App.tsx`
- `templates/vite-spa/src/todos.ts`
- `templates/vite-spa/src/styles.css`
- `templates/vite-spa/src/vite-env.d.ts`
- Test: `templates/vite-spa/src/app.smoke.test.tsx`

- [ ] **Step 1: Create `template.json` and `package.json`**

`templates/vite-spa/template.json`:

```json
{
  "order": 1,
  "display": "Vite (client-only SPA)",
  "description": "The simplest rxfy setup: one model, one state, useStateData — no server, no SSR"
}
```

`templates/vite-spa/package.json`:

```json
{
  "name": "rxfy-template-vite-spa",
  "version": "0.0.0",
  "private": true,
  "description": "rxfy client-only SPA: Vite + React + normalized reactive state",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "check-types": "tsc -b --noEmit",
    "clean": "rimraf ./dist",
    "dev": "vite",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "lodash": "^4.17.21",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.8.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.2.0",
    "rimraf": "^6.0.1",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4"
  }
}
```

(`lodash` is a peer dep of `rxfy` — see CLAUDE.md — so the app must provide it. `workspace:*` deps are rewritten to real versions by `prepare-templates.ts` at build time.)

- [ ] **Step 2: Create the build/config files**

`templates/vite-spa/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>rxfy app</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`templates/vite-spa/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
```

`templates/vite-spa/vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: "node",
  },
});
```

`templates/vite-spa/tsconfig.json`:

```json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

`templates/vite-spa/tsconfig.app.json`:

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
  "include": ["src"]
}
```

`templates/vite-spa/tsconfig.node.json`:

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
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`templates/vite-spa/.gitignore`:

```
node_modules
dist
*.tsbuildinfo
.env
```

- [ ] **Step 3: Create the app source**

`templates/vite-spa/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`templates/vite-spa/src/todos.ts` — the whole rxfy setup in one file:

```ts
import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

// Entities normalize into a shared store keyed by id — every subscriber to an id re-renders on store.set.
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

// The page's state over that store: data$ emits { todos: string[] } (ids), entities resolve from the store.
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});

// Stub data source — replace with your API call. Anything async returning the denormalized shape works.
export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  return {
    todos: [
      { id: "1", title: "Replace fetchTodos with a real API call", done: false },
      { id: "2", title: "Read https://rxfy.vanya2h.me", done: false },
    ],
  };
}
```

`templates/vite-spa/src/App.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { fetchTodos, todoModel, todosState } from "./todos.ts";

// Subscribes to one entity by id — a store.set for this id re-renders only this item.
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li>
          <label>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => store.set(todo.id, { ...todo, done: !todo.done })}
            />
            <span className={todo.done ? "done" : ""}>{todo.title}</span>
          </label>
        </li>
      )}
    </Pending>
  );
}

export function App() {
  const params = useMemo(() => ({}), []);
  const { data$, mutations } = useStateData({ state: todosState, fetchFn: fetchTodos, params });
  const [title, setTitle] = useState("");

  return (
    <main>
      <h1>rxfy todos</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          // The mutation normalizes the entity into the store and appends its id to the list.
          mutations.addTodo({ id: crypto.randomUUID(), title: next, done: false });
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        <button type="submit">Add</button>
      </form>
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul>
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

`templates/vite-spa/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
```

`templates/vite-spa/src/styles.css`:

```css
:root {
  color-scheme: light dark;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

body {
  margin: 0;
  display: flex;
  justify-content: center;
}

main {
  width: min(40rem, 100vw - 2rem);
  padding: 2rem 0 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

form {
  display: flex;
  gap: 0.5rem;
}

form input {
  flex: 1;
  padding: 0.5rem;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.done {
  text-decoration: line-through;
  opacity: 0.6;
}
```

`templates/vite-spa/README.md`:

````markdown
# rxfy client-only SPA

The simplest [rxfy](https://rxfy.vanya2h.me) setup: a Vite + React SPA with one model, one state, and one mutation. No server, no SSR — `src/todos.ts` is the whole data layer.

## Try it

```bash
pnpm install
pnpm dev
```

## Where things live

- `src/todos.ts` — model + state + stub fetch (replace `fetchTodos` with your API call)
- `src/App.tsx` — `useStateData` for the list, `useModelStore(...).get(id)` per entity
- `src/main.tsx` — `<StoreProvider>` wraps the app once

## Scripts

| Script             | What it does                   |
| ------------------ | ------------------------------ |
| `pnpm dev`         | Vite dev server                |
| `pnpm build`       | Production bundle into `dist/` |
| `pnpm preview`     | Serve the production build     |
| `pnpm test`        | Render smoke test              |
| `pnpm check-types` | Typecheck                      |

Docs: https://rxfy.vanya2h.me
````

- [ ] **Step 4: Write the smoke test**

`templates/vite-spa/src/app.smoke.test.tsx`:

```tsx
import { renderToString } from "react-dom/server";
import { StoreProvider } from "rxfy-react";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
  it("renders the shell with the query pending", () => {
    const html = renderToString(
      <StoreProvider>
        <App />
      </StoreProvider>,
    );
    expect(html).toContain("rxfy todos");
    // renderToString is synchronous — the stub fetch hasn't resolved, so the list is PENDING.
    expect(html).toContain("Loading…");
  });
});
```

- [ ] **Step 5: Install and run the smoke test**

Run: `pnpm install` (from the repo root — registers the new workspace package)
Then: `pnpm --filter rxfy-template-vite-spa test`
Expected: PASS (1 test). If `rxfy`/`rxfy-react` dist is missing, run `pnpm turbo build --filter rxfy-react` first.

- [ ] **Step 6: Typecheck and build the template**

Run: `pnpm --filter rxfy-template-vite-spa check-types`
Expected: exits 0.
Run: `pnpm --filter rxfy-template-vite-spa build`
Expected: Vite build succeeds, `templates/vite-spa/dist/` created.

- [ ] **Step 7: Commit**

```bash
git add templates/vite-spa pnpm-lock.yaml
git commit -m "feat(create-rxfy-app): vite-spa template — client-only rxfy starter"
```

---

### Task 3: Bundle `vite-spa` into the CLI and verify end-to-end

**Files:**

- Modify: `packages/create-rxfy-app/package.json` (devDependencies)
- Modify: `packages/create-rxfy-app/README.md` (templates table)

- [ ] **Step 1: Register the template as a devDependency**

In `packages/create-rxfy-app/package.json` `devDependencies`, add (alphabetical position, next to `rxfy-template-vite`):

```json
    "rxfy-template-vite-spa": "workspace:*",
```

This mirrors how `rxfy-template-vite` is wired in so turbo's `^build`/`^test` graph covers the template. Run `pnpm install` after editing.

- [ ] **Step 2: Update the README templates table**

In `packages/create-rxfy-app/README.md`, replace the Templates table with:

```markdown
| Name       | Stack                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| `vite-spa` | Client-only Vite + React SPA — one model, one state, no server                     |
| `vite`     | Vite SSR + React Router + Hono + Drizzle/PGlite + rxfy live updates over WebSocket |
```

- [ ] **Step 3: Build the CLI and inspect the bundled templates**

Run: `pnpm --filter create-rxfy-app build`
Expected output includes both `prepared template: vite` and `prepared template: vite-spa`.

Verify: `cat packages/create-rxfy-app/dist/templates/vite-spa/package.json`
Expected: `rxfy` and `rxfy-react` deps are real semver versions (not `workspace:*`), and `_gitignore` exists (`ls packages/create-rxfy-app/dist/templates/vite-spa/_gitignore`).

- [ ] **Step 4: Scaffold from the built CLI and verify the picker order**

Run (use the session scratchpad dir, not /tmp):

```bash
cd <scratchpad>
node /Users/ivankoryakovtsev/Work/rxfy/packages/create-rxfy-app/dist/index.js spa-check --template vite-spa --json --full-output
```

Expected: `{ "ok": true, "data": { "projectName": "spa-check", "template": "vite-spa", ... } }`, and `spa-check/` contains `src/todos.ts`, `.gitignore` (not `_gitignore`), no `template.json`, and `package.json` with `"name": "spa-check"`.

Then confirm ordering — run without `--template` in non-TTY mode:

```bash
node /Users/ivankoryakovtsev/Work/rxfy/packages/create-rxfy-app/dist/index.js order-check --json --full-output; echo "exit: $?"
```

Expected: non-zero exit with error code `MISSING_TEMPLATE` and a message listing the templates as `vite-spa, vite` (order field working: vite-spa first despite alphabetical order putting `vite` first).

Clean up: `rm -rf spa-check order-check`.

- [ ] **Step 5: Run the package tests and commit**

Run: `pnpm --filter create-rxfy-app test && pnpm --filter create-rxfy-app check-types && pnpm --filter create-rxfy-app lint`
Expected: all pass.

```bash
git add packages/create-rxfy-app/package.json packages/create-rxfy-app/README.md pnpm-lock.yaml
git commit -m "feat(create-rxfy-app): bundle the vite-spa template"
```

---

### Task 4: Slim the `vite` template to one entity / one page

Per the spec's content policy, the live template keeps exactly one of everything. The only excess today is the About page.

**Files:**

- Delete: `templates/vite/src/pages/AboutPage.tsx`
- Modify: `templates/vite/src/App.tsx`
- Modify: `templates/vite/src/ssr.smoke.test.ts`

- [ ] **Step 1: Delete the About page and simplify App**

```bash
git rm templates/vite/src/pages/AboutPage.tsx
```

Replace the full contents of `templates/vite/src/App.tsx` with:

```tsx
import { Link, Route, Routes } from "react-router";
import { TodosPage } from "./pages/TodosPage.js";

export function App() {
  return (
    <main>
      <header>
        <Link to="/">rxfy live todos</Link>
      </header>
      <Routes>
        <Route path="/" element={<TodosPage />} />
        <Route path="*" element={<p>Not found.</p>} />
      </Routes>
    </main>
  );
}
```

- [ ] **Step 2: Drop the About smoke test**

In `templates/vite/src/ssr.smoke.test.ts`, delete the second `it(...)` block (the one titled `"server-renders a non-root route on direct navigation"` that renders `/about`). Keep the first test unchanged.

- [ ] **Step 3: Run the template's tests and typecheck**

Run: `pnpm --filter rxfy-template-vite test && pnpm --filter rxfy-template-vite check-types`
Expected: PASS — 1 SSR smoke test + the live smoke tests, typecheck clean. (`src/routes.ts` never referenced `/about`, so no change there.)

- [ ] **Step 4: Commit**

```bash
git add templates/vite/src/App.tsx templates/vite/src/ssr.smoke.test.ts
git commit -m "refactor(create-rxfy-app): slim vite template to one entity, one page"
```

---

### Task 5: Changeset + full verification

**Files:**

- Modify: `.changeset/create-rxfy-app.md`

- [ ] **Step 1: Update the pending changeset**

`create-rxfy-app` is unreleased (version 0.0.0) with one pending changeset describing the initial release — extend it rather than adding a second. Replace the body of `.changeset/create-rxfy-app.md` (keep the frontmatter `"create-rxfy-app": minor` as is) with:

```markdown
New package: `create-rxfy-app` — scaffold a standalone rxfy app from an official template
(`pnpm create rxfy-app`). Ships two templates: `vite-spa`, a client-only Vite + React SPA
(one model, one state — the simplest rxfy setup), and `vite`, a fully SSR'd live todos app
(Vite + React Router + Hono + Drizzle/PGlite + rxfy live updates over WebSocket). The picker
lists templates in a curated order via an `order` field in each template's `template.json`.

The CLI is built on incur: interactive clack prompts in a terminal, and a structured JSON/TOON
envelope with stable error codes (`DIR_NOT_EMPTY`, `UNKNOWN_TEMPLATE`, …) when run by agents or
in pipes. Ships built-in `skills add`, `--llms`, and `--mcp` agent integrations. Requires Node 22+.
```

- [ ] **Step 2: Full verification across affected packages**

Run from the repo root:

```bash
pnpm turbo build test check-types lint --filter create-rxfy-app --filter rxfy-template-vite-spa --filter rxfy-template-vite
```

Expected: all tasks pass.

- [ ] **Step 3: Commit**

```bash
git add .changeset/create-rxfy-app.md
git commit -m "docs: extend create-rxfy-app changeset with vite-spa template and picker order"
```
