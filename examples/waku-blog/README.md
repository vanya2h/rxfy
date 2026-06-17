# rxfy + Waku blog example

A [Waku](https://waku.gg) (minimal React framework, RSC-based) blog using **rxfy** for
normalized, reactive state with SSR hydration. Companion to the `next-blog` (Next.js App Router)
and `rr7-blog` (React Router 7) examples — same domain, three frameworks.

## What it shows

- **Static home (`/`)** — `getConfig { render: "static" }`. Posts are prefetched and dehydrated
  at build time; the list ships in fully static HTML with rxfy data already hydrated.
- **Dynamic detail (`/posts/[slug]`)** — `getConfig { render: "dynamic" }`. Fetched and dehydrated
  per request.
- **Client navigation** — Waku `Link`; the rxfy store lives in the persistent root layout and
  survives route transitions, so seen entities are not refetched.

## How rxfy + Waku fit together

Waku is RSC-based and exposes no script-injection seam (unlike Next's `useServerInsertedHTML`,
which `rxfy-react/next`'s `HydrationStream` relies on, or React Router's custom `entry.server`).
So instead of injecting a snapshot _after_ render, each page **prefetches before render**:

1. The page (a Server Component) calls a rxfy fetcher into a fresh `ModelRegistry`, then
   `dehydrate`s it — see `src/ssr.ts`.
2. The JSON-safe snapshot is passed as a prop to `<HydrateSnapshot>`, a client component that
   merges it into the single `StoreProvider` registry owned by the root layout (`src/providers.tsx`).
3. Client components (`useStateData`, `useModelStore`, `Pending`) read from the hydrated store —
   no client fetch on first paint.

`src/ssr.ts`'s `prefetch` is built only from public `rxfy` exports (`normalizeResult`,
`stableStringify`, `createFulfilled`, `dehydrate`) — no library changes required.

## Run

```bash
pnpm --filter rxfy-example-waku-blog dev
pnpm --filter rxfy-example-waku-blog build
pnpm --filter rxfy-example-waku-blog start
```
