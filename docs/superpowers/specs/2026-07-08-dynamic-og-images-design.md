# Dynamic OG Images for the Docs Site — Design

**Date:** 2026-07-08
**Status:** Approved
**Scope:** `apps/docs` only. No published package changes; no changeset needed.

## Goal

Every page on [rxfy.vanya2h.me](https://rxfy.vanya2h.me) gets a branded, page-specific
Open Graph image (1200×630 PNG) showing the page title and description, rendered
**on demand** by a **self-hosted** endpoint on the same server that serves the docs.
Comparable to [Vocs dynamic OG images](https://vocs.dev/features/dynamic-og-images),
but without depending on the vocs.dev hosted API.

## Approach

Vocs 2 is built on Waku, and its patched fs-router preserves Waku's `_api` directory
convention: a file under `src/pages/_api/` exporting a `GET` handler becomes a
**dynamic API route** served by the same process in `vocs dev`, `vocs preview`, and
the production Docker container. No changes to `serve-node.js`, the Dockerfile, or
deployment are required.

Rejected alternatives:

- **vocs.dev hosted OG API** — zero infra but external dependency; user chose self-hosted.
- **Build-time static PNGs** — self-contained but pre-generates everything; user requires on-demand rendering.
- **Custom server entry wrapping `INTERNAL_runFetch`** — works (verified the export exists in `dist/server/index.js`) but is the fallback only if the `_api` route turns out not to survive `vocs build`.

## Components

### 1. OG endpoint — `apps/docs/src/pages/_api/og.tsx`

Route: `GET /og` (Waku strips the `_api` prefix).

- Reads `title`, `description` (and the cache-busting `v`, ignored for rendering)
  from the query string.
- Renders a 1200×630 card with **satori** (JSX → SVG), rasterizes with
  **@resvg/resvg-js** (SVG → PNG), responds `image/png`.
- Declared dynamic (default for API routes; no `render: 'static'` config), so
  images are created on demand — nothing is generated at build time.

### 2. Card design

- Dark background matching the docs dark theme.
- White rxfy lockup (`public/rxfy-lockup-white.svg`) embedded as a data URI `<img>`.
- Page title, large, semibold; description below in a muted tone.
- `rxfy.vanya2h.me` as a footer line.
- Fonts: Inter Regular + SemiBold TTFs vendored under `apps/docs/public/fonts/`,
  read from disk once at first request and cached at module level. Path resolution
  must work for both dev (`public/fonts/…`) and production (`dist/public/fonts/…`)
  relative to the app directory — try both candidates.

### 3. Caching

Two layers, both satisfying "cached per input params, invalidated per redeploy":

- **In-process cache:** a module-level `Map<string, Buffer>` keyed by the full
  normalized query string (title + description). Repeat requests for the same
  params serve the cached PNG without re-rendering. The map dies with the process,
  so every redeploy starts fresh. Cap entries (e.g. ~200, drop oldest) so a
  crawler fuzzing query params can't grow memory unboundedly.
- **External caches (scrapers, CDNs, browsers):** responses carry
  `Cache-Control: public, max-age=31536000, immutable`. This is safe because the
  URL itself is versioned per deploy (below), so a redeploy changes every OG URL
  and external caches refetch naturally.

### 4. Config — `apps/docs/vocs.config.ts`

```ts
const buildId = Date.now().toString(36); // evaluated once per build/dev-server start

export default defineConfig({
  baseUrl: "https://rxfy.vanya2h.me",
  ogImageUrl: `https://rxfy.vanya2h.me/og?title=%title&description=%description&v=${buildId}`,
  // …existing config
});
```

- The URL is absolute because social scrapers do not resolve relative `og:image`.
- `%title` / `%description` are substituted per page by Vocs — every doc page gets
  its own image with no per-page work.
- `vocs.config.ts` is evaluated at build time, so `buildId` is stamped into the
  meta tags of the built HTML and changes on every deploy (per-redeploy cache bust).

### 5. Dependencies

`satori` and `@resvg/resvg-js` are added to the docs app's **`dependencies`**
(not devDependencies): the Docker production stage installs with `--prod` and the
endpoint renders at runtime. resvg ships prebuilt native binaries for macOS (dev)
and linux gnu (node:22-slim image). The docs app is private, so no changeset.

## Error handling

- Missing or empty `title` → fall back to "rxfy" with the site description.
- Overlong title/description → clamped with ellipsis in the card layout (satori
  handles wrapping; enforce a max character count before render).
- Render failure → 500 with a plain-text body; affects only link previews, never
  the site itself.

## Verification

1. `pnpm --filter docs dev`, request `/og?title=Test&description=Hello` — PNG renders,
   correct card, second request served from cache.
2. `pnpm --filter docs build && pnpm --filter docs preview` — confirm the dynamic
   API route survives the production build (the one real risk; fallback is the
   custom server entry noted above).
3. View source on a built page — `<meta property="og:image">` contains the absolute
   `/og?…&v=<buildId>` URL with the page's own title/description.
4. `docker build -f apps/docs/Dockerfile .` succeeds (resvg native dep installs in
   the slim image).

## Out of scope

- Per-page custom card layouts or frontmatter-driven imagery.
- Persistent (disk/CDN) render cache.
- OG images for the example apps.
