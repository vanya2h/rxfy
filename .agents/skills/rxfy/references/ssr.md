# SSR

rxfy's states and stores are serializable, so SSR is first-class: rxfy captures fetch results on the server into a per-request `ModelRegistry`, serializes them with `dehydrate`, injects the snapshot into the HTML, and the client `StoreProvider` rehydrates it automatically — zero client fetches on first paint.

## Prerequisites

Two fields are required for SSR to work:

| What                                           | Field  | Why                                     |
| ---------------------------------------------- | ------ | --------------------------------------- |
| `createModel({ schema, getKey, name: "..." })` | `name` | Stable key for entity store dehydration |
| `defineState({ key: "...", ... })`             | `key`  | Stable key for the query cache          |

Both are required by the types — `createModel` will not compile without `name`, nor `defineState` without `key`. Plain value fields (bare zod schemas in a state's `model`) need no `name` — they ride inside the keyed state's dehydrated value, so keep them JSON-serializable.

## Mode 1 — Buffered (`renderToPipeableStream` + `onAllReady`)

Use when you control the server and can buffer the full HTML before sending.

```tsx
// server
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { renderToPipeableStream } from "react-dom/server";

const registry = createModelRegistry();

const { pipe } = renderToPipeableStream(
  <StoreProvider registry={registry} ssr>
    <App />
  </StoreProvider>,
  {
    onAllReady() {
      pipe(res); // send HTML first, then inject the snapshot
      res.write(hydrationScript(dehydrate(registry)));
      res.end();
    },
  },
);

// client — no extra wiring needed
import { hydrateRoot } from "react-dom/client";
hydrateRoot(
  document.getElementById("root")!,
  <StoreProvider ssr>
    <App />
  </StoreProvider>,
);
// StoreProvider drains window.__RXFY_SSR__ automatically on mount
```

## Mode 2 — Streaming (Next.js App Router)

Use `rxfy-react/next`'s `<HydrationStream />` in your root layout. It flushes serialized chunks as each Suspense boundary resolves, so the client receives data progressively.

```tsx
// app/layout.tsx (Server Component)
import { HydrationStream } from "rxfy-react/next";
import { StoreProvider } from "rxfy-react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <StoreProvider ssr>
          <HydrationStream />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
```

`HydrationStream` renders inline `<script>` tags that push chunks onto `window.__RXFY_SSR__`. The client `StoreProvider` patches `Array.prototype.push` on that queue to hydrate late chunks as they arrive.

**Streaming without Next.js:** with raw `renderToPipeableStream`, send the shell on `onShellReady`, then write `hydrationScript(dehydrate(registry))` once the HTML stream finishes (the registry is fully populated only after the last Suspense boundary flushes). For a single-snapshot-at-the-end approach, prefer Mode 1 (buffered) instead.

## Mode 3 — Two-Pass (`renderToString`)

Use for environments without streaming support.

```tsx
import { collectStateData } from "rxfy-react";
import { renderToString } from "react-dom/server";

// Pass 1: collect all state (triggers fetches via Suspense)
const { dehydratedState } = await collectStateData(<App />);

// Pass 2: render with hydrated state — synchronous, no Suspense waterfalls
const html = renderToString(
  <StoreProvider dehydratedState={dehydratedState} ssr>
    <App />
  </StoreProvider>,
);
// Inject dehydratedState into the page for the client to pick up
```

## StoreProvider SSR Props

| Prop              | Type              | Purpose                                                                                                                                                                                                       |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssr`             | `boolean`         | Enables server-side fetch-and-suspend in `useStateData`. Pass `true` on both server and client.                                                                                                               |
| `registry`        | `IModelRegistry`  | The registry to use. Server: a fresh per-request instance — the same one you call `dehydrate` on. Client: usually omitted (StoreProvider creates one); pass your own when other code needs a reference to it. |
| `dehydratedState` | `DehydratedState` | Prop-based hydration for two-pass mode.                                                                                                                                                                       |

## SSR APIs

```ts
import { createModelRegistry, dehydrate, hydrate, hydrationScript } from "rxfy";

const registry = createModelRegistry();

// After render — capture all fetched data
const snapshot = dehydrate(registry);
// → { queries: Record<string, SerializedWrapped>, models: Record<string, Record<string, unknown>> }

// Inject into HTML (generates a <script> tag)
hydrationScript(snapshot);

// On the client (if not using StoreProvider's automatic ingestion)
hydrate(registry, snapshot);
```
