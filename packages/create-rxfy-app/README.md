# create-rxfy-app

Scaffold a standalone [rxfy](https://rxfy.vanya2h.me) app from an official template.

```bash
pnpm create rxfy-app my-app
# or: npm create rxfy-app@latest my-app
# or: yarn create rxfy-app my-app
```

## Templates

| Name       | Stack                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| `vite-spa` | Client-only Vite + React SPA — one model, one state, no server                              |
| `vite`     | Vite SSR + React Router + Hono + Drizzle/PGlite + rxfy sync updates over WebSocket          |
| `next`     | Next.js App Router — SSR store via RSC prefetch + hydrate, isomorphic fetch, server actions |

Pick non-interactively with `--template`:

```bash
pnpm create rxfy-app my-app --template vite
```

Templates are bundled with each release and pinned to the matching rxfy versions.

## Agents & scripting

The CLI is built with [incur](https://www.npmjs.com/package/incur): when stdout is not a TTY it skips the
interactive prompts and emits a structured envelope instead. Pass the project name (and `--template` if more
than one is bundled) and read the result as JSON:

```bash
create-rxfy-app my-app --template vite --json --full-output
# → { "ok": true, "data": { "projectName": "my-app", "template": "vite", "dir": "/abs/path/my-app" } }
```

Failures carry stable, machine-readable codes (`MISSING_PROJECT_NAME`, `DIR_NOT_EMPTY`, `UNKNOWN_TEMPLATE`,
`MISSING_TEMPLATE`, `NO_TEMPLATES`) plus a `retryable` flag, and exit non-zero.

Agent integrations come built in:

```bash
create-rxfy-app skills add   # install a skill file so agents discover the CLI
create-rxfy-app --llms       # print an agent-readable command manifest
create-rxfy-app --mcp        # serve the command as an MCP stdio tool
```

Requires Node 22+.
