# rxfy-server

Server-side live data for [rxfy](https://rxfy.vanya2h.me). Bind [Drizzle](https://orm.drizzle.team) tables to rxfy models, write through the server, and publish live updates to subscribers.

## Install

```bash
npm install rxfy-server
# peer deps: rxfy drizzle-orm drizzle-zod zod
```

## What it gives you

- `defineResource` — bind a Drizzle table to an rxfy model (derived automatically, or pass a pre-made `model` shared with client code).
- `createResourceRegistry` — a typed index of resources.
- `createServer` — `live.create` / `live.update` / `live.delete` that write to the DB and publish `patch` / `stale` messages.
- `createInMemoryHub` — session-keyed pub/sub routing that pushes `patch` / `stale` messages to the sessions the serve path subscribed.
- `live.serve` — a read-endpoint pass-through: returns the data unchanged and registers the served entities + state channel under the requester's session.
- `live.hydration` — the one-call SSR payload: dehydrate the registry, mint a session, and register everything the render fetched.
- `rxfy-server/browser` — browser-safe subpath exporting the resource API without the Node-only server, so resources and their models can be imported into client bundles.

See the [rxfy-server docs](https://rxfy.vanya2h.me/framework/server) for the full walkthrough.
