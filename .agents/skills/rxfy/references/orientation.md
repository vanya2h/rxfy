# Orientation — read this once per session, on first contact

Before touching an rxfy project, establish **how the code got here** and **how integrated it already is**, so you extend the existing wiring instead of rebuilding it. Emit a one-line routing verdict, then get to work.

## First — check for a recorded variant (skip detection if found)

The `rxfy-setup` skill records the setup variant when rxfy is installed. Look for a `<!-- rxfy-setup:variant -->` marker (in `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`, or agent memory):

```
grep -rn "rxfy-setup:variant" CLAUDE.md AGENTS.md GEMINI.md 2>/dev/null
```

If found, the `Variant:` line beneath it tells you entry mode + depth directly — **skip Q1/Q2 detection** and go straight to the verdict. Values map as: `template: <name>` → scaffolded template (read `templates.md`); `existing-app, depth: <level>` → incremental adoption at that level.

If there is no marker (rxfy added by hand, or an older project), fall back to the on-disk detection below. Detect from signals where you can; **if the signals are ambiguous or conflicting, ask the user — as many questions as you need** to pin down entry mode and depth. Then **record what you determined** (see "Record it" at the end) so no session has to detect or ask again.

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

## Record it (only when there was no marker)

If you had to detect or ask because no `<!-- rxfy-setup:variant -->` marker existed, persist what you found so this never repeats. Prefer `CLAUDE.md` (ask before writing if it's the user's file); write the same block `rxfy-setup` uses:

```md
## rxfy setup

<!-- rxfy-setup:variant -->

- Variant: <template: NAME (...) | existing-app, depth: Store | +SSR | +Sync>
```

Use `existing-app, depth: <level>` for hand-added rxfy (there's no template). Next session's grep finds the marker and skips straight to the verdict.
