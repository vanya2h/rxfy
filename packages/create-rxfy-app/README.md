# create-rxfy-app

Scaffold a standalone [rxfy](https://rxfy.vanya2h.me) app from an official template.

```bash
pnpm create rxfy-app my-app
# or: npm create rxfy-app@latest my-app
# or: yarn create rxfy-app my-app
```

## Templates

| Name | Stack |
|---|---|
| `vite` | Vite SSR + React Router + Hono + Drizzle/PGlite + rxfy live updates over WebSocket |

Pick non-interactively with `--template`:

```bash
pnpm create rxfy-app my-app --template vite
```

Templates are bundled with each release and pinned to the matching rxfy versions.
