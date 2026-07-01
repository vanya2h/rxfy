# vite-blog-framework

A live blog example that demonstrates the rxfy live framework (`rxfy-server` + `rxfy-ws` + the React live client from `rxfy-react`). Post and comment **edits** apply live in place across all connected tabs — no page reload. Post and comment **creates** and **deletes** surface a non-intrusive badge ("1 new post · click to refresh") that appears on each tab; the badge is powered entirely by `useStateData().updatesAvailable$` from the rxfy React bindings — no custom counter logic.

## Stack

- **Vite SSR** — isomorphic rendering with Hono as the request handler
- **Hono** + **`@hono/node-ws`** — HTTP API + WebSocket transport for live messages
- **PGlite** — in-memory Postgres (no external DB needed; resets on restart)
- **Drizzle ORM** — type-safe schema + queries
- **rxfy-server** — `defineResource` / `createServer` / `createTopicKeyer` / `touch`
- **rxfy-ws** — WebSocket protocol layer (server-side `createWsServer`)
- **rxfy-react** — `useStateData`, live client, `StoreProvider`
- **shadcn/ui** (Tailwind v4) — `Card`/`Button`/`Input`/`Textarea`/`Select` components, semantic theme
  tokens, and a light/dark toggle in the header (persisted to `localStorage`). The data + live
  wiring is unchanged by the UI layer.

## Run

```
pnpm --filter vite-blog-framework dev
```

Open http://localhost:5176. The in-memory database resets each time the server restarts.

## Two-tab demo script

1. Open two browser tabs at `/`.
2. In **tab A**, click **New post**, fill in the form, and submit. Both tab A and tab B show a "1 new post · click to refresh" badge. Click the badge in tab B to see the post list update.
3. On any post, click **Edit**, change the title, and save. Both tabs update the post title live — no badge, no refresh needed.
4. Open a post in both tabs. In tab A, add a comment. Tab B's post page shows a "1 new comment" badge; click it to load the comment.
5. Delete a post or comment in either tab. The "1 new post" / "1 new comment" badge appears in the other tab.

## How it works

`defineResource` derives an rxfy model and Drizzle table operations from the schema in one call. `createServer` wraps `create` / `update` / `delete` so every write also broadcasts over the hub: an **update** publishes a `patch` message on the entity's topic (`post:<id>`); a **create** or **delete** publishes a `stale` message on the state channel named in the `touch(...)` call (e.g. `posts` or `post-detail:postId=<id>`). `rxfy-ws` carries those messages over a single WebSocket connection. On the client, `createLiveClient` applies `patch` messages directly to the shared model store (so the updated entity re-renders everywhere it is used) and increments a per-channel stale counter for `stale` messages — that counter is what `updatesAvailable$` exposes. Grants (HMAC-hashed topic ids with a rolling time window) are minted at fetch/SSR time and sent to the client so it can subscribe to exactly the topics relevant to the data it received.

## Notes

This is a private example package (not published to npm). It is intended as a reference implementation only.
