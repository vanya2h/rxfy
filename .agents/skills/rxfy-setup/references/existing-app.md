# Existing app — adopt rxfy at a depth

Add rxfy to a React app you already have. Levels are additive — install for the depth the app needs and stop there. `+SSR` needs the same packages as `Store` (it only changes how the provider renders); `+Sync` adds the server/transport/client packages on top.

Commands below show npm + pnpm; the same package lists work for yarn/bun. rxfy declares its peers (`rxjs`, `zod`, `lodash`, and for sync `drizzle-orm`/`drizzle-zod`/`ws`) as **peer dependencies**, so install them explicitly.

## Store — client-only reactive state

```bash
# npm
npm install rxfy rxfy-react
npm install rxjs zod lodash

# pnpm
pnpm add rxfy rxfy-react
pnpm add rxjs zod lodash
```

Bootstrap: wrap the app root once in `StoreProvider` (no props for client-only):

```tsx
import { StoreProvider } from "rxfy-react";
createRoot(document.getElementById("root")!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
```

Then hand off → `rxfy` skill: `models-states.md` (declare the first model + state), `react-bindings.md` (read it).

## +SSR — server-render first paint, hydrate with no refetch

Same packages as Store (no new installs). The change is at the render boundary: one `createModelRegistry()` per request, `<StoreProvider registry={registry} ssr>` on the server, `dehydrate` + `hydrationScript` into the HTML, and `<StoreProvider ssr>` on the client.

Then hand off → `rxfy` skill: `ssr.md` (buffered / streaming / two-pass modes and the `name`/`key` requirements).

## +Sync — server writes push real-time updates

```bash
# npm
npm install rxfy rxfy-client rxfy-react rxfy-server rxfy-server-drizzle rxfy-ws
npm install rxjs zod lodash drizzle-orm drizzle-zod ws

# pnpm
pnpm add rxfy rxfy-client rxfy-react rxfy-server rxfy-server-drizzle rxfy-ws
pnpm add rxjs zod lodash drizzle-orm drizzle-zod ws
```

This needs a server and a database (the guide uses Drizzle; `rxfy-server-drizzle` is the storage adapter). Bootstrap is multi-file — a resource, a `createSync` instance, a WebSocket server, and a `createSyncClient` on the browser — so do not inline it here.

Then hand off → `rxfy` skill: `sync-server.md` (`defineResource`, `sync.*`, hub), `sync-client.md` (`createSyncClient`, `updatesAvailable$`/`applyUpdates`), `sync-grants.md` (the `$grant` custody and renewal), `sync-transport.md` (WS transports).

## Record the variant, then hand off

After installing, **record the setup variant** (see "Record the setup variant" in `SKILL.md`) — e.g. `existing-app, depth +Sync`. Later sessions read that instead of re-detecting from disk. Then continue in the `rxfy` skill per the handoff for your depth.
