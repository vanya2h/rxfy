# Orientation — read this once per session, on first contact

Before touching an rxfy project, establish **how the code got here** and **how integrated it already is**, so you extend the existing wiring instead of rebuilding it. Answer both from on-disk signals — do not ask the user. Emit a one-line routing verdict, then get to work.

## Q1 — How did this code get here?

**Scaffolded by `create-rxfy-app`?** Look for template fingerprints:

- A serverless Vite SPA (`rxfy` + `rxfy-react` only, single `main.tsx`, no `server/`) → `vite-spa`.
- Next App Router with `src/app/api/**/route.ts` and `rxfy-server`/`rxfy-ws` deps → `next`.
- A top-level `server/` dir with `hono` + `entry-server.tsx`/`entry-client.tsx` → `vite`.

→ If any match, **read `templates.md` first.** The store, SSR, and sync plumbing already exist; your job is to add an entity or feature on top, not to re-wire the app.

**Existing app adopting rxfy?** No template fingerprint — rxfy deps were added to an established project (its own router, build, structure). → The task is _adding a capability_. Skip `templates.md`; go straight to the task mini-guide from the `SKILL.md` library.

## Q2 — How integrated already? (extend, don't duplicate)

- `rxfy` + `rxfy-react`, no server → **Store**. Reads via `useStateData`; local writes via `defineState` `mutations`.
- SSR wiring present — `dehydrate`/`hydrate`, `<HydrationStream />`, or RSC prefetch + hydrate → **+SSR**.
- `rxfy-server`/`rxfy-ws`/`rxfy-client`, `createSyncClient`, `defineResource` present → **+Sync** (server writes publish `patch`/`stale`; client subscribes).

## Non-linear cases — don't assume a ladder

Levels are additive as a _default_, not a rule. A project can be **Sync without SSR** (a client-only SPA that added a sync client) or **SSR without Sync**. Check Q2 signals directly; never infer "has sync ⇒ has SSR" or vice versa. The `next` and `vite` templates ship Sync **and** SSR together; `vite-spa` is Store only.

## The verdict

State it in one line, then act. Examples:

- _"Scaffolded `vite` template, Sync level → read `templates.md`, then `sync-server.md` to add a resource."_
- _"Existing Next app, +SSR level, no sync → this is Path A adding a store/SSR feature; read `models-states.md` + `ssr.md`."_
- _"Existing SPA, Store level → read `models-states.md` + `react-bindings.md`."_
