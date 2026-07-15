# vite-kanban Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `examples/vite-kanban` — a single, fully server-rendered kanban board that is live across browser tabs via the rxfy sync layer; dragging/reordering/editing a card `patch`es in place across tabs, creating/deleting goes `stale`.

**Architecture:** Copy the wiring of `examples/vite-blog` (Vite SSR + Hono + `@hono/node-ws` + PGlite/drizzle + rxfy sync) and replace the blog domain with one `Card` entity across three fixed columns. Columns are constants; a card's place is `(columnId, position)` where `position` is a `fractional-indexing` string. The board state's query holds all card ids; each column list is derived client-side by filtering on `columnId` and sorting on `position`. Drag → `sync.update` → `patch` (id-list unchanged); create/delete → `touch(boardState)` → `stale`.

**Tech Stack:** Vite 6, React 19, react-router 7, Hono, `@hono/node-ws`, PGlite + drizzle-orm, `rxfy` / `rxfy-react` / `rxfy-server` / `rxfy-server-drizzle` / `rxfy-ws` / `rxfy-client`, Tailwind v4, `@dnd-kit/core` + `@dnd-kit/sortable`, `fractional-indexing`, Vitest.

**Reference example:** `examples/vite-blog` (branch `develop`). Read a file there whenever a step says "mirror the blog". **Work on branch `develop`** (that is where the spec commit and the renamed `examples/vite-blog` live).

**Dev port:** `5177` (blog uses `5176`).

---

## Task 1: Scaffold the package (config + static shell)

**Files:**

- Create: `examples/vite-kanban/package.json`
- Create: `examples/vite-kanban/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `examples/vite-kanban/eslint.config.ts`
- Create: `examples/vite-kanban/vite.config.ts`
- Create: `examples/vite-kanban/vitest.config.ts`
- Create: `examples/vite-kanban/components.json`
- Create: `examples/vite-kanban/index.html`
- Create: `examples/vite-kanban/public/favicon.svg`
- Create: `examples/vite-kanban/src/vite-env.d.ts`
- Create: `examples/vite-kanban/src/styles.css`
- Create: `examples/vite-kanban/.gitignore`

- [ ] **Step 1: Copy boilerplate verbatim from the blog example**

These files are identical to the blog except where noted. Copy each from `examples/vite-blog/<same path>` to `examples/vite-kanban/<same path>` byte-for-byte:

- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- `eslint.config.ts`
- `vitest.config.ts`
- `components.json`
- `public/favicon.svg`
- `src/vite-env.d.ts`
- `src/styles.css`
- `.gitignore`

```bash
cd examples
mkdir -p vite-kanban/public vite-kanban/src
for f in tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.ts vitest.config.ts components.json .gitignore; do cp vite-blog/$f vite-kanban/$f; done
cp vite-blog/public/favicon.svg vite-kanban/public/favicon.svg
cp vite-blog/src/vite-env.d.ts vite-kanban/src/vite-env.d.ts
cp vite-blog/src/styles.css vite-kanban/src/styles.css
cd ..
```

- [ ] **Step 2: Write `examples/vite-kanban/vite.config.ts`** (identical to blog)

```ts
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  ssr: {
    noExternal: ["examples-shared"],
  },
  optimizeDeps: {
    exclude: ["examples-shared"],
  },
});
```

- [ ] **Step 3: Write `examples/vite-kanban/package.json`**

Same deps as `examples/vite-blog/package.json`, plus `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and `fractional-indexing` in `dependencies`. Name/description changed.

```json
{
  "name": "vite-kanban",
  "version": "0.1.0",
  "private": true,
  "description": "Live kanban example (Vite SSR + Hono + PGlite + the rxfy live framework)",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "check-types": "tsc -b --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsx ./server/index.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.tsx --outDir dist/server",
    "preview": "cross-env NODE_ENV=production tsx ./server/index.ts",
    "test": "vitest run --passWithNoTests",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.5.3",
    "@hono/node-server": "^1.14.0",
    "@hono/node-ws": "^1.1.0",
    "@hono/zod-validator": "^0.8.0",
    "@tailwindcss/vite": "^4.3.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vanya2h/eslint-config": "^0.7.0",
    "@vitejs/plugin-react": "^5.2.0",
    "cross-env": "^7.0.3",
    "drizzle-orm": "^0.45.2",
    "eslint": "^9.27.0",
    "examples-shared": "workspace:*",
    "hono": "^4.7.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router": "^7.9.0",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxfy-server": "workspace:*",
    "rxfy-server-drizzle": "workspace:*",
    "rxfy-ws": "workspace:*",
    "rxjs": "^7.8.2",
    "tailwindcss": "^4.3.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4",
    "zod": "^4.4.3"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@fontsource-variable/geist": "^5.2.9",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "fractional-indexing": "^3.2.0",
    "lucide-react": "^1.22.0",
    "radix-ui": "^1.6.1",
    "rxfy-client": "workspace:*",
    "shadcn": "^4.12.0",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0"
  }
}
```

- [ ] **Step 4: Write `examples/vite-kanban/index.html`** (blog's, retitled)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>rxfy — live kanban</title>
    <script>
      try {
        var t = localStorage.getItem("theme");
        if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches))
          document.documentElement.classList.add("dark");
      } catch (e) {}
    </script>
    <link rel="stylesheet" href="/src/styles.css" />
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <!--app-state-->
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: completes; `vite-kanban` appears in the workspace, new deps (`@dnd-kit/*`, `fractional-indexing`) resolve. No TypeScript check yet (source not written).

- [ ] **Step 6: Commit**

```bash
git add examples/vite-kanban pnpm-lock.yaml
git commit -m "chore(vite-kanban): scaffold package config and static shell"
```

---

## Task 2: Database schema + seed

**Files:**

- Create: `examples/vite-kanban/src/db/schema.ts`
- Create: `examples/vite-kanban/server/db.ts`

- [ ] **Step 1: Write `src/db/schema.ts`**

One `cards` table. `position` is a text fractional-index key; `column_id` is the fixed column.

```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  columnId: text("column_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: text("position").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Write `server/db.ts`** (mirrors blog `server/db.ts`; PGlite + drizzle, idempotent seed)

Seeds cards across the three columns. Positions are generated with `generateNKeysBetween(null, null, n)` so they sort correctly within each column.

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateNKeysBetween } from "fractional-indexing";
import { cards } from "../src/db/schema.js";

const globalForPglite = globalThis as unknown as { __kanbanPglite?: PGlite };
const client = (globalForPglite.__kanbanPglite ??= new PGlite());
export const db = drizzle(client);

const DDL = `
  CREATE TABLE cards (
    id text PRIMARY KEY,
    column_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    position text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  );
`;

/** Column → seed card titles (oldest first). */
const SEED: Record<string, { title: string; description: string }[]> = {
  todo: [
    { title: "Draft the roadmap", description: "Outline Q3 goals and milestones." },
    { title: "Design the landing page", description: "" },
    { title: "Set up CI", description: "GitHub Actions for lint + test." },
  ],
  doing: [
    { title: "Wire the sync layer", description: "patch on move, stale on create/delete." },
    { title: "Write the drag interactions", description: "dnd-kit + fractional positions." },
  ],
  done: [{ title: "Scaffold the repo", description: "Vite SSR + Hono + PGlite." }],
};

let ready: Promise<void> | undefined;

/** Create tables + seed once. Idempotent (awaited by the server before handling requests). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.exec(DDL);
      const rows: (typeof cards.$inferInsert)[] = [];
      for (const [columnId, items] of Object.entries(SEED)) {
        const positions = generateNKeysBetween(null, null, items.length);
        items.forEach((item, i) => {
          rows.push({
            id: `${columnId}-${i + 1}`,
            columnId,
            title: item.title,
            description: item.description,
            position: positions[i]!,
          });
        });
      }
      await db.insert(cards).values(rows);
    })();
  }
  return ready;
}

export { cards };
```

- [ ] **Step 3: Commit**

```bash
git add examples/vite-kanban/src/db examples/vite-kanban/server/db.ts
git commit -m "feat(vite-kanban): cards table schema and seeded PGlite db"
```

---

## Task 3: Domain — model, state, resource

**Files:**

- Create: `examples/vite-kanban/src/kanban/models.ts`
- Create: `examples/vite-kanban/src/kanban/states.ts`
- Create: `examples/vite-kanban/src/kanban/resources.ts`

- [ ] **Step 1: Write `src/kanban/models.ts`**

The `Card` entity schema + model, branded id, column constants, and write-payload schemas. Mirrors `examples/example-shared/src/data/models.ts` shape.

```ts
import { createModel } from "rxfy";
import { z } from "zod";

export const COLUMNS = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" },
] as const;
export type ColumnId = (typeof COLUMNS)[number]["id"];
export const ColumnIdSchema = z.enum(["todo", "doing", "done"]);

export const CardIdSchema = z.string().brand("CardId");
export type CardId = z.infer<typeof CardIdSchema>;

export const CardSchema = z.object({
  id: CardIdSchema,
  columnId: ColumnIdSchema,
  title: z.string(),
  description: z.string(),
  position: z.string(),
  createdAt: z.coerce.date(),
});
export type Card = z.infer<typeof CardSchema>;

/** Per-endpoint write payloads. */
export const CreateCardInputSchema = z.object({ columnId: ColumnIdSchema, title: z.string().min(1) });
export const UpdateCardInputSchema = z
  .object({
    columnId: ColumnIdSchema,
    title: z.string().min(1),
    description: z.string(),
    position: z.string(),
  })
  .partial();
export type CreateCardInput = z.infer<typeof CreateCardInputSchema>;
export type UpdateCardInput = z.infer<typeof UpdateCardInputSchema>;

export const cardModel = createModel({ schema: CardSchema, getKey: (c) => c.id, name: "card" });
```

Note: `createdAt` uses `z.coerce.date()` because drizzle returns a `Date` and `sync.serve` parses raw rows through this schema (the blog's `PostSchema` omits `createdAt` from its model; here we keep it and coerce).

- [ ] **Step 2: Write `src/kanban/states.ts`**

One state: all card ids across the board.

```ts
import { array, defineState } from "rxfy";
import { z } from "zod";
import { cardModel } from "./models";

export const boardState = defineState({
  key: "board",
  params: z.object({}),
  model: { cards: array(cardModel) },
});
```

- [ ] **Step 3: Write `src/kanban/resources.ts`** (mirrors blog `src/blog/resources.ts`)

```ts
import { createResourceRegistry } from "rxfy-server";
import { defineResource } from "rxfy-server-drizzle";
import { cards } from "../db/schema.js";
import { cardModel } from "./models.js";

export const cardResource = defineResource({ table: cards, model: cardModel });

export { cardModel };

export const resources = createResourceRegistry([cardResource]);
```

- [ ] **Step 4: Commit**

```bash
git add examples/vite-kanban/src/kanban/models.ts examples/vite-kanban/src/kanban/states.ts examples/vite-kanban/src/kanban/resources.ts
git commit -m "feat(vite-kanban): card model, board state, drizzle resource"
```

---

## Task 4: Sync + WebSocket + API server modules

**Files:**

- Create: `examples/vite-kanban/server/sync.ts`
- Create: `examples/vite-kanban/server/ws.ts`
- Create: `examples/vite-kanban/server/api.ts`

- [ ] **Step 1: Write `server/sync.ts`** (identical to blog `server/sync.ts` except db import)

```ts
import { createInMemoryHub, createSync } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { db } from "./db.js";

// One hub instance — entry-server receives `sync` as a parameter, so the Vite SSR graph never
// instantiates a second hub.
export const hub = createInMemoryHub();

// HMAC secret shared with the WebSocket server (ws.ts). Override via RXFY_SECRET in production.
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

export const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
```

- [ ] **Step 2: Write `server/ws.ts`** (identical to blog `server/ws.ts`)

```ts
import { EventEmitter } from "node:events";
import type { UpgradeWebSocket } from "hono/ws";
import { createWsServer } from "rxfy-ws";
import { hub, SECRET } from "./sync.js";

const wsServer = createWsServer(hub, { secret: SECRET });

/** Register the `/live` WebSocket handler using a Hono app's upgradeWebSocket helper. */
export function liveRoute(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket(() => {
    const emitter = new EventEmitter();
    return {
      onOpen(_evt: Event, ws: { send: (data: string) => void }) {
        wsServer.handleConnection({
          send: (data: string) => ws.send(data),
          on: (event, cb) => emitter.on(event, cb),
        });
      },
      onMessage(evt: MessageEvent) {
        emitter.emit("message", evt.data);
      },
      onClose() {
        emitter.emit("close");
      },
    };
  });
}
```

- [ ] **Step 3: Write `server/api.ts`**

Routes: `GET /board` (serve state + `$grant`), `POST /live/renew`, `POST /cards`, `PATCH /cards/:id`, `DELETE /cards/:id`. Create/delete `touch(boardState, {})` (→ stale); patch does not touch (→ patch only). New card position = after the last card in its column (`generateKeyBetween(lastPos, null)`).

```ts
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { CreateCardInputSchema, UpdateCardInputSchema } from "../src/kanban/models.js";
import { cardResource } from "../src/kanban/resources.js";
import { boardState } from "../src/kanban/states.js";
import { cards, db } from "./db.js";
import { sync } from "./sync.js";

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/board", async (c) => {
    const allCards = await db.select().from(cards).orderBy(asc(cards.position));
    // serve() parses raw rows through the state schema and attaches a signed channel grant as
    // `$grant`; the client lifts it and subscribes on its own WebSocket.
    return c.json(sync.serve(boardState, {}, { cards: allCards }));
  })
  .post("/live/renew", async (c) => {
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => sync.renew(g)) });
  })
  .post("/cards", zValidator("json", CreateCardInputSchema), async (c) => {
    const { columnId, title } = c.req.valid("json");
    // Append: new position just after the current last card in the target column.
    const columnCards = await db
      .select({ position: cards.position })
      .from(cards)
      .where(eq(cards.columnId, columnId))
      .orderBy(asc(cards.position));
    const lastPos = columnCards.at(-1)?.position ?? null;
    const position = generateKeyBetween(lastPos, null);
    const row = await sync.create(
      cardResource,
      { id: newId(), columnId, title, description: "", position },
      { touch: [touch(boardState, {})] },
    );
    return c.json(row);
  })
  .patch("/cards/:id", zValidator("json", UpdateCardInputSchema), async (c) => {
    const patch = c.req.valid("json");
    // No touch: a move/edit only changes entity fields, so the board id-list is unchanged → pure patch.
    const row = await sync.update(cardResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/cards/:id", async (c) => {
    await sync.delete(cardResource, c.req.param("id"), { touch: [touch(boardState, {})] });
    return c.json({ ok: true });
  });

export type AppType = typeof api;
```

- [ ] **Step 4: Commit**

```bash
git add examples/vite-kanban/server/sync.ts examples/vite-kanban/server/ws.ts examples/vite-kanban/server/api.ts
git commit -m "feat(vite-kanban): sync, websocket, and card CRUD api"
```

---

## Task 5: API client

**Files:**

- Create: `examples/vite-kanban/src/kanban/api-client.tsx`

- [ ] **Step 1: Write `src/kanban/api-client.tsx`** (mirrors blog `src/blog/api-client.tsx`, retyped to this `AppType`)

```tsx
import type { Hono } from "hono";
import { hc } from "hono/client";
import { createContext, type ReactNode, useContext } from "react";
import type { AppType } from "../../server/api.js";

/** The shape of hono's in-process `app.request` — what the server entry injects for SSR. */
export type ApiFetch = Hono["request"];

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * The typed RPC client over the hono endpoints. In the browser it makes a real network trip; during
 * SSR the server entry passes its in-process api (hono's `app.request`), so the same routes serve
 * both environments. Sync subscriptions ride channel grants (returned as `$grant`), so the client
 * carries no session header.
 */
export function createApiClient(serverFetch?: ApiFetch) {
  return serverFetch ? hc<AppType>("http://ssr.internal", { fetch: serverFetch }) : hc<AppType>("/api");
}

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

/** The typed RPC client from context. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("ApiProvider not found");
  return client;
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-kanban/src/kanban/api-client.tsx
git commit -m "feat(vite-kanban): typed hono api client (SSR + browser)"
```

---

## Task 6: SSR entries + server host + App shell

**Files:**

- Create: `examples/vite-kanban/server/render-types.ts`
- Create: `examples/vite-kanban/server/render.ts`
- Create: `examples/vite-kanban/server/index.ts`
- Create: `examples/vite-kanban/src/entry-server.tsx`
- Create: `examples/vite-kanban/src/entry-client.tsx`
- Create: `examples/vite-kanban/src/App.tsx`

- [ ] **Step 1: Write `server/render-types.ts`** (identical to blog)

```ts
import type { Hono } from "hono";
import type { Sync } from "rxfy-server";

/**
 * The SSR entry contract: implemented by src/entry-server.tsx, invoked by server/render.ts with THIS
 * module graph's `sync` and in-process `api.request`.
 */
export type RenderFn = (
  url: string,
  sync: Sync<any>,
  apiFetch: Hono["request"],
) => Promise<{ html: string; state: string }>;
```

- [ ] **Step 2: Write `server/render.ts`** (identical to blog `server/render.ts`)

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";
import { api } from "./api.js";
import type { RenderFn } from "./render-types.js";
import { sync } from "./sync.js";

export async function renderPage(url: string, vite: ViteDevServer | undefined, isProduction: boolean): Promise<string> {
  let template: string;
  let render: RenderFn;
  if (!isProduction) {
    if (!vite) throw new Error("vite dev server is required outside production");
    template = await fs.readFile("./index.html", "utf-8");
    template = await vite.transformIndexHtml(url, template);
    render = (await vite.ssrLoadModule("/src/entry-server.tsx")).render;
  } else {
    template = await fs.readFile("./dist/client/index.html", "utf-8");
    const entryUrl = pathToFileURL(path.resolve(process.cwd(), "dist/server/entry-server.js")).href;
    render = (await import(entryUrl)).render;
  }
  const rendered = await render(url, sync, api.request);
  return template.replace("<!--app-html-->", rendered.html).replace("<!--app-state-->", rendered.state);
}
```

- [ ] **Step 3: Write `server/index.ts`** (blog's, retitled + port 5177)

```ts
/* eslint-disable turbo/no-undeclared-env-vars */
import { createServer as createHttpServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { ViteDevServer } from "vite";
import { api } from "./api.js";
import { initDb } from "./db.js";
import { renderPage } from "./render.js";
import { liveRoute } from "./ws.js";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 5177;

await initDb();

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

app.route("/api", api);
app.get("/live", liveRoute(upgradeWebSocket));

let vite: ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
} else {
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
}

app.get("*", async (c) => {
  try {
    return c.html(await renderPage(c.req.path, vite, isProduction));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.error(err.stack);
    return c.text(err.stack ?? String(err), 500);
  }
});

const honoListener = getRequestListener(app.fetch);
const server = createHttpServer((req, res) => {
  if (vite) vite.middlewares(req, res, () => honoListener(req, res));
  else honoListener(req, res);
});
injectWebSocket(server);
server.listen(port, () => console.log(`Live kanban at http://localhost:${port}`));
```

- [ ] **Step 4: Write `src/entry-server.tsx`** (blog's, no router needed — single page)

```tsx
import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry } from "rxfy";
import { StoreProvider } from "rxfy-react";
import type { RenderFn } from "../server/render-types.js";
import { ApiProvider, createApiClient } from "./kanban/api-client.js";
import { App } from "./App.js";

export const render: RenderFn = (_url, sync, apiFetch) => {
  const apiClient = createApiClient(apiFetch);
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <ApiProvider client={apiClient}>
            <Suspense fallback={null}>
              <App />
            </Suspense>
          </ApiProvider>
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            resolve({ html, state: sync.hydration(registry) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
};
```

- [ ] **Step 5: Write `src/entry-client.tsx`** (blog's, no router)

```tsx
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createModelRegistry } from "rxfy";
import { createSyncClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { ApiProvider, createApiClient } from "./kanban/api-client.js";
import { App } from "./App.js";

const registry = createModelRegistry();
const apiClient = createApiClient();
const syncClient = createSyncClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  renewUrl: "/api/live/renew",
});

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr syncClient={syncClient}>
      <ApiProvider client={apiClient}>
        <App />
      </ApiProvider>
    </StoreProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Write `src/App.tsx`** (thin shell; fetch board, render `<Board>`)

`Board` is created in Task 7; this shell fetches `boardState` and passes the handle down.

```tsx
import { parseResponse } from "hono/client";
import { useStateData } from "rxfy-react";
import { useApi } from "./kanban/api-client.js";
import { Board } from "./kanban/Board.js";
import { boardState } from "./kanban/states.js";
import { ThemeToggle } from "./kanban/ThemeToggle.js";

export function App() {
  const api = useApi();
  const board = useStateData({
    state: boardState,
    fetchFn: () => parseResponse(api.board.$get()),
    params: {},
  });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">rxfy live kanban</h1>
        <ThemeToggle />
      </header>
      <Board board={board} />
    </main>
  );
}
```

- [ ] **Step 7: Copy the ThemeToggle**

Copy `examples/vite-blog/src/components/ThemeToggle.tsx` to `examples/vite-kanban/src/kanban/ThemeToggle.tsx` verbatim (it imports `Button` from `examples-shared/ui/button` and needs no changes).

```bash
cp examples/vite-blog/src/components/ThemeToggle.tsx examples/vite-kanban/src/kanban/ThemeToggle.tsx
```

- [ ] **Step 8: Commit** (types will not fully check until Task 7 adds `Board`; commit anyway as WIP)

```bash
git add examples/vite-kanban/server examples/vite-kanban/src/entry-server.tsx examples/vite-kanban/src/entry-client.tsx examples/vite-kanban/src/App.tsx examples/vite-kanban/src/kanban/ThemeToggle.tsx
git commit -m "feat(vite-kanban): ssr entries, server host, app shell"
```

---

## Task 7: Board UI — columns, cards, drag, forms

**Files:**

- Create: `examples/vite-kanban/src/kanban/useCards.ts`
- Create: `examples/vite-kanban/src/kanban/Board.tsx`
- Create: `examples/vite-kanban/src/kanban/Column.tsx`
- Create: `examples/vite-kanban/src/kanban/Card.tsx`
- Create: `examples/vite-kanban/src/kanban/CardEditor.tsx`
- Create: `examples/vite-kanban/src/kanban/NewCardForm.tsx`

- [ ] **Step 1: Write `src/kanban/useCards.ts`** — reactive read of many card entities

The board query gives all card ids; ordering is by the `position` entity field, which changes via live `patch`. So the grouping must re-derive whenever any card cell updates. This hook subscribes to every card atom and returns the current entities.

```ts
import { useMemo } from "react";
import { combineLatest, of } from "rxjs";
import { useModelStore, useObservable } from "rxfy-react";
import { type Card, cardModel } from "./models";

/** Reactively read the given card ids as entities; re-emits when any card cell changes (e.g. a patch). */
export function useCards(ids: string[]): Card[] {
  const store = useModelStore(cardModel);
  const key = ids.join(",");
  const source$ = useMemo(
    () => (ids.length === 0 ? of([] as Card[]) : combineLatest(ids.map((id) => store.get(id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, key],
  );
  const initial = useMemo(
    () => ids.map((id) => store.getValue(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, key],
  );
  return useObservable(source$, initial);
}
```

- [ ] **Step 2: Write `src/kanban/Card.tsx`** — one draggable, editable card

Uses `useSortable` from `@dnd-kit/sortable`. Shows title + description; pencil toggles the editor; trash deletes (→ stale, host refetches via `applyUpdates`).

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { parseResponse } from "hono/client";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "examples-shared/ui/button";
import { Card as UICard } from "examples-shared/ui/card";
import { useApi } from "./api-client.js";
import { CardEditor } from "./CardEditor.js";
import type { Card as CardEntity } from "./models";

export function Card({ card, onDeleted }: { card: CardEntity; onDeleted: () => void }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const remove = async () => {
    await parseResponse(api.cards[":id"].$delete({ param: { id: card.id } }));
    onDeleted();
  };

  return (
    <UICard ref={setNodeRef} style={style} className="flex flex-col gap-2 p-3">
      {editing ? (
        <CardEditor card={card} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="cursor-grab touch-none font-medium" {...attributes} {...listeners}>
              {card.title}
            </span>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" aria-label="Edit card" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete card" onClick={remove}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          {card.description ? <p className="text-muted-foreground text-sm">{card.description}</p> : null}
        </>
      )}
    </UICard>
  );
}
```

- [ ] **Step 3: Write `src/kanban/CardEditor.tsx`** — inline title/description edit → PATCH (patch)

Optimistically writes the card cell, then PATCHes; the echoed patch is idempotent.

```tsx
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Button } from "examples-shared/ui/button";
import { Input } from "examples-shared/ui/input";
import { Textarea } from "examples-shared/ui/textarea";
import { useModelStore } from "rxfy-react";
import { useApi } from "./api-client.js";
import { type Card, cardModel } from "./models";

export function CardEditor({ card, onDone }: { card: Card; onDone: () => void }) {
  const api = useApi();
  const store = useModelStore(cardModel);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);

  const save = async () => {
    const next = { ...card, title: title.trim() || card.title, description };
    store.get(card.id).set(next); // optimistic in-place update
    onDone();
    await parseResponse(
      api.cards[":id"].$patch({ param: { id: card.id }, json: { title: next.title, description: next.description } }),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Card title" />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Card description"
        rows={2}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/kanban/NewCardForm.tsx`** — add a card to a column → POST (stale)

```tsx
import { parseResponse } from "hono/client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "examples-shared/ui/button";
import { Input } from "examples-shared/ui/input";
import { useApi } from "./api-client.js";
import type { ColumnId } from "./models";

export function NewCardForm({ columnId, onCreated }: { columnId: ColumnId; onCreated: () => void }) {
  const api = useApi();
  const [title, setTitle] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    await parseResponse(api.cards.$post({ json: { columnId, title: t } }));
    onCreated(); // stale → applyUpdates refetches the id-list
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a card…"
        aria-label="New card title"
      />
      <Button type="submit" size="icon" aria-label="Add card">
        <Plus className="size-4" />
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Write `src/kanban/Column.tsx`** — one column: droppable + sortable list

```tsx
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Card as CardEntity, ColumnId } from "./models";
import { Card } from "./Card.js";
import { NewCardForm } from "./NewCardForm.js";

export function Column({
  columnId,
  title,
  cards,
  onChanged,
}: {
  columnId: ColumnId;
  title: string;
  cards: CardEntity[];
  onChanged: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${columnId}` });
  return (
    <section className="bg-muted/40 flex w-72 shrink-0 flex-col gap-3 rounded-lg p-3">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {title} · {cards.length}
      </h2>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-8 flex-col gap-2">
          {cards.map((card) => (
            <Card key={card.id} card={card} onDeleted={onChanged} />
          ))}
        </div>
      </SortableContext>
      <NewCardForm columnId={columnId} onCreated={onChanged} />
    </section>
  );
}
```

- [ ] **Step 6: Write `src/kanban/Board.tsx`** — DndContext, derive columns, handle drop

Reads the board handle (from `App`), derives sorted per-column lists via `useCards`, and on drop computes a fractional `position`, optimistically moves the card, then PATCHes (→ patch across tabs). Create/delete come back through `applyUpdates`.

```tsx
import { closestCorners, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { generateKeyBetween } from "fractional-indexing";
import { parseResponse } from "hono/client";
import { Pending, type StateHandle, useModelStore } from "rxfy-react";
import { useApi } from "./api-client.js";
import { Column } from "./Column.js";
import { COLUMNS, type Card as CardEntity, type ColumnId, cardModel } from "./models";
import { useCards } from "./useCards.js";

/** Group + sort a flat card list into the fixed columns, ordered by fractional position. */
function byColumn(cards: CardEntity[]): Record<ColumnId, CardEntity[]> {
  const out = { todo: [], doing: [], done: [] } as Record<ColumnId, CardEntity[]>;
  for (const c of cards) out[c.columnId]?.push(c);
  for (const id of Object.keys(out) as ColumnId[]) out[id].sort((a, b) => (a.position < b.position ? -1 : 1));
  return out;
}

/** Resolve the drop target (column + insertion index) from dnd-kit's `over` id. */
function resolveDrop(overId: string, grouped: Record<ColumnId, CardEntity[]>): { columnId: ColumnId; index: number } {
  if (overId.startsWith("col:")) {
    const columnId = overId.slice(4) as ColumnId;
    return { columnId, index: grouped[columnId].length };
  }
  for (const columnId of Object.keys(grouped) as ColumnId[]) {
    const idx = grouped[columnId].findIndex((c) => c.id === overId);
    if (idx !== -1) return { columnId, index: idx };
  }
  return { columnId: "todo", index: 0 };
}

export function Board({ board }: { board: StateHandle<{ cards: unknown }> }) {
  const api = useApi();
  const store = useModelStore(cardModel);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;

    const active = store.getValue(activeId) as CardEntity | undefined;
    if (!active) return;

    // Fresh grouping from the store (authoritative current positions).
    const grouped = byColumn((store.valueEntries() as [string, CardEntity][]).map(([, c]) => c).filter(Boolean));
    const { columnId, index } = resolveDrop(overId, grouped);

    // Neighbors at the drop index in the destination column, excluding the dragged card itself.
    const dest = grouped[columnId].filter((c) => c.id !== activeId);
    const before = dest[index - 1]?.position ?? null;
    const after = dest[index]?.position ?? null;
    const position = generateKeyBetween(before, after);

    // Optimistic in-place move; the server echoes an idempotent patch.
    store.get(activeId).set({ ...active, columnId, position });
    void parseResponse(api.cards[":id"].$patch({ param: { id: activeId }, json: { columnId, position } }));
  };

  return (
    <Pending
      value$={board.data$}
      pending={<p className="text-muted-foreground">Loading board…</p>}
      rejected={() => <p className="text-destructive">Failed to load.</p>}
    >
      {({ cards }: { cards: string[] }) => (
        <BoardColumns ids={cards} onDragEnd={onDragEnd} sensors={sensors} onChanged={board.applyUpdates} />
      )}
    </Pending>
  );
}

function BoardColumns({
  ids,
  onDragEnd,
  sensors,
  onChanged,
}: {
  ids: string[];
  onDragEnd: (e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  onChanged: () => void;
}) {
  const cards = useCards(ids);
  const grouped = byColumn(cards);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Column key={col.id} columnId={col.id} title={col.title} cards={grouped[col.id]} onChanged={onChanged} />
        ))}
      </div>
    </DndContext>
  );
}
```

Type note for the implementer: `StateHandle`'s full generic signature is `StateHandle<TShape, TMutations, TQuery, TWritable>` (see `examples/example-shared/src/blog/PostList.tsx` for the `StateHandleFor<S>` helper). To keep `Board`'s prop precise, either import and use `StateHandleFor<typeof boardState>` from a local copy of that helper, or type the prop as `ReturnType<typeof useStateData<typeof boardState>>`. Verify the exact exported generic when wiring — adjust the `{ cards: unknown }` placeholder above to the real handle type so `board.data$` / `board.applyUpdates` type-check.

- [ ] **Step 7: Verify types + dev boot**

Run: `pnpm --filter vite-kanban check-types`
Expected: PASS (fix any handle-typing mismatch per the note above).

Run (manual smoke): `pnpm --filter vite-kanban dev`, open `http://localhost:5177`, confirm three columns with seeded cards render, drag a card between columns, add/delete a card. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add examples/vite-kanban/src/kanban
git commit -m "feat(vite-kanban): board, columns, draggable cards, forms"
```

---

## Task 8: Sync server smoke test

**Files:**

- Create: `examples/vite-kanban/server/sync.smoke.test.ts`

- [ ] **Step 1: Write the test** (mirrors blog `server/sync.smoke.test.ts`, scoped to cards)

Asserts: (a) the resource registry knows `card`; (b) `sync.update` on a card broadcasts a `patch` on the entity topic; (c) create/delete `touch(boardState)` broadcasts a bare `stale` on the board channel.

```ts
import { boardState } from "../src/kanban/states.js";
import { cardResource, resources } from "../src/kanban/resources.js";
import { createInMemoryHub, createSync, type PublishSink, touch } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { describe, expect, it } from "vitest";

type ServerMessage = Parameters<PublishSink>[1];

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE cards (
      id text PRIMARY KEY, column_id text NOT NULL, title text NOT NULL,
      description text NOT NULL DEFAULT '', position text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  return db;
}

describe("vite-kanban sync server", () => {
  it("registers the card resource", () => {
    expect(resources.byName("card")).toBe(cardResource);
  });

  it("update broadcasts a patch on the entity topic (a move)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: "test-secret" });
    await sync.create(cardResource, { id: "k1", columnId: "todo", title: "T", description: "", position: "a0" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["e:card:k1"], Date.now() + 60_000);

    const row = await sync.update(cardResource, "k1", { columnId: "doing", position: "a1" });
    expect(row).toMatchObject({ columnId: "doing", position: "a1" });
    expect(received).toEqual([
      {
        v: 2,
        kind: "patch",
        name: "card",
        id: "k1",
        data: {
          id: "k1",
          columnId: "doing",
          title: "T",
          description: "",
          position: "a1",
          createdAt: expect.any(Date),
        },
      },
    ]);
  }, 30_000);

  it("create touches the board channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: "test-secret" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["c:board"], Date.now() + 60_000);

    await sync.create(
      cardResource,
      { id: "k2", columnId: "todo", title: "New", description: "", position: "a0" },
      { touch: [touch(boardState, {})] },
    );
    expect(received).toEqual([{ v: 2, kind: "stale", channel: "board" }]);
  }, 30_000);
});
```

Verification note: confirm the channel-name strings (`e:card:k1`, `c:board`) and the `stale` payload `channel` value against the blog test's actual output — the blog uses `c:posts` / `channel: "posts"`, so `board` follows from `key: "board"`. If `stateChannel(boardState, {})` yields a different string, use it.

- [ ] **Step 2: Run the test**

Run: `pnpm --filter vite-kanban test`
Expected: PASS (3 tests). If the patch `data` includes fields in a different order or shape, align the expectation to the actual `sync.update` return.

- [ ] **Step 3: Commit**

```bash
git add examples/vite-kanban/server/sync.smoke.test.ts
git commit -m "test(vite-kanban): sync patch/stale smoke test"
```

---

## Task 9: SSR smoke test

**Files:**

- Create: `examples/vite-kanban/server/ssr.smoke.test.ts`

- [ ] **Step 1: Write the test** (mirrors blog `server/ssr.smoke.test.ts`)

Boots the real server in production mode and asserts the board HTML is fully resolved (renders without JS) and carries the hydration snapshot + grants.

```ts
import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 5400 + (process.pid % 500);
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;

async function waitForServer(timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/board`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("server did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("SSR end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/tsx", ["./server/index.ts"], {
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
      detached: true,
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("serves the board fully resolved — renders without JavaScript", async () => {
    const html = await (await fetch(`${BASE}/`)).text();

    expect(html).toContain("To Do"); // fixed column heading
    expect(html).toContain("Draft the roadmap"); // seeded card title
    expect(html).toContain("__RXFY_SSR__"); // hydration snapshot embedded
    expect(html).toContain("grants"); // signed channel grants ride alongside the registry
    expect(html).not.toContain("$RC"); // no inline reveal scripts (buffered onAllReady)
  }, 30_000);
});
```

- [ ] **Step 2: Build, then run the test** (the SSR test needs the production build; turbo runs `build` before `test`)

Run: `pnpm --filter vite-kanban build`
Expected: client + server builds succeed.

Run: `pnpm --filter vite-kanban test`
Expected: PASS (sync + SSR tests). If `To Do`/card text is HTML-escaped differently, assert on a substring that survives escaping.

- [ ] **Step 3: Commit**

```bash
git add examples/vite-kanban/server/ssr.smoke.test.ts
git commit -m "test(vite-kanban): SSR renders board without JS"
```

---

## Task 10: README + monorepo verification

**Files:**

- Create: `examples/vite-kanban/README.md`
- Reference: root `turbo build`/`test`/`lint`/`check-types`

- [ ] **Step 1: Write `examples/vite-kanban/README.md`**

Short README modeled on `examples/vite-blog/README.md`. Cover: what it is (live kanban, full SSR), the patch-vs-stale story (drag = patch, create/delete = stale), how to run (`pnpm --filter vite-kanban dev`, port 5177), and the `RXFY_SECRET` env for production. Read the blog README first and match its tone/sections.

- [ ] **Step 2: Full monorepo checks**

Run: `turbo build --filter vite-kanban`
Expected: PASS.

Run: `turbo lint check-types test --filter vite-kanban`
Expected: PASS. Fix any prettier/eslint issues (120 print width, double quotes, semicolons, trailing commas).

- [ ] **Step 3: Commit**

```bash
git add examples/vite-kanban/README.md
git commit -m "docs(vite-kanban): add README"
```

---

## Notes & non-goals

- No changeset (examples are private, unpublished).
- No `examples/e2e` `sync-kanban` target this iteration (deferred).
- Columns are fixed constants; no column CRUD, no multi-board, no card labels/assignees.
- `onDragEnd`-only drop handling (no live cross-column preview via `onDragOver`) — acceptable for the example; the card commits to its new column on drop.
- Cross-tab live behavior is what the two smoke tests encode structurally; the manual dev smoke in Task 7 Step 7 is the human-observed confirmation.
