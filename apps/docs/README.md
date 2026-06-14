# rxfy docs

Documentation site for rxfy, built with [Vocs](https://vocs.dev).

## Develop

```bash
pnpm --filter docs dev      # http://localhost:5173
pnpm --filter docs build    # static build to dist/
pnpm --filter docs preview  # preview the production build
```

Pages live in `src/pages/` as MDX; the sidebar is configured in `vocs.config.ts`.

## Dependency note: the `waku` pin

`waku` is pinned to the exact version `1.0.0-beta.1` (no caret) on purpose. Vocs
2.0.12 imports `contextMiddleware` from waku's hono middleware, an export that was
**removed in waku `1.0.0-beta.2`**. Any later beta breaks the static build with
`TypeError: contextMiddleware is not a function`. Do not widen this range or run
`pnpm update` on `waku` without first confirming the installed Vocs version still
works against the newer waku. Revisit this pin when bumping Vocs.

The Waku-generated `src/pages.gen.ts` route-types file is gitignored; it is
regenerated on every build/dev.
