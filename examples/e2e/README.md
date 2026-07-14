# rxfy-e2e

Playwright suite that drives every sync-capable example/template in a real browser and asserts live
cross-tab sync. Private; never published. Wired into CI as `turbo run e2e`.

## What it covers

| Capability   | Apps                                                | Asserts                                        |
| ------------ | --------------------------------------------------- | ---------------------------------------------- |
| `sync-blog`  | next-blog, rr7-blog, vite-blog-framework, waku-blog | comment in tab B → live badge in tab A → apply |
| `sync-todos` | templates/vite, templates/next                      | create → badge → apply; toggle → both tabs     |

Each app is one Playwright project (own port + server). `targets.ts` is the single registry driving
projects and webServers. Tests load routes **directly (SSR)** in two browser contexts — client
navigation would mask the grant-subscription regression this suite exists to catch, and each tab
asserts it actually sent a `subscribe` WS frame on load.

## Run

```bash
pnpm --filter rxfy-e2e exec playwright install chromium   # once
pnpm test:e2e                                             # build apps + run all projects
pnpm --filter rxfy-e2e exec playwright test --project=template-vite   # one app
pnpm --filter rxfy-e2e test:ui                            # interactive
```

Ports 4301–4306 (+ waku's WS on 8090) must be free. Playwright boots all six servers regardless of
`--project`, so all target apps must be built first (`pnpm turbo build`).
