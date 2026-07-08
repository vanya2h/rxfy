---
"create-rxfy-app": minor
---

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
