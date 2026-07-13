# vite-blog-framework — shadcn UI Conversion Design

**Date:** 2026-07-01
**Status:** Approved (pending spec review)
**Target:** `examples/vite-blog-framework` (private example)

## 1. Goal

Convert the `vite-blog-framework` example's hand-rolled HTML + `styles.css` UI to **shadcn/ui**
(Tailwind v4), as the "core components, keep it simple" tier: `Button`, `Card`, `Input`,
`Textarea`, `Select`, `Badge`, `Separator` + Tailwind layout, plus a light/dark toggle. The
data/live wiring (`useStateData`, `Pending`, `useModelStore`, the live client) is **untouched** —
this is a presentation-layer change only.

## 2. Scope

### In scope

- Tailwind v4 setup (`@tailwindcss/vite`) + the `@/*` path alias (client + SSR builds).
- `shadcn init` (neutral base) → `components.json`, `src/lib/utils.ts` (`cn`), theme CSS vars.
- Add components: `button card input textarea select badge separator`.
- Rewrite the 8 UI components with shadcn primitives + Tailwind, following the shadcn skill's
  rules (semantic tokens, `gap-*` not `space-*`, `size-*`, `cn()`, Card composition, lucide icons).
- The live counter (`UpdatesBadge`) renders as a `Button` (`variant="secondary" size="sm"`) with a
  `RefreshCw` icon.
- A `ThemeToggle` (header, Sun/Moon) that flips the `dark` class on `<html>` + persists to
  `localStorage`; an inline pre-paint script in `index.html` to avoid FOUC / SSR mismatch.
- Delete the old `styles.css` hand-rolled classes (the file becomes the Tailwind entry).

### Non-goals

- No `Field`/`FieldGroup` form wrappers, `Skeleton`, `Alert`, `Dialog`, or `sonner` (deferred —
  "keep it simple"; loading/error use plain `text-muted-foreground`/`text-destructive`).
- No change to data fetching, states, resources, the server, or the live protocol.
- No `next-themes` dependency (the toggle is ~15 lines of plain React).
- No new tests (UI-only; the existing server smoke test is unaffected).

## 3. Setup

### 3.1 Tailwind v4 + Vite

- Add deps: `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, and shadcn runtime deps
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (plus the `@radix-ui/*`
  packages the added components pull in transitively).
- `vite.config.ts`: add the `@tailwindcss/vite` plugin and `resolve.alias` `{ "@": "/src" }`
  (resolved relative to the project root). Keep `@vitejs/plugin-react`.
- `src/styles.css` becomes the Tailwind entry:
  ```css
  @import "tailwindcss";
  @import "tw-animate-css";
  @custom-variant dark (&:is(.dark *));
  /* :root { … } .dark { … } @theme inline { … } — shadcn theme variables (neutral) */
  ```
  (The exact variable block is what `shadcn init` writes; use the CLI's output.)

### 3.2 Path alias

- `tsconfig.app.json`: add `compilerOptions.baseUrl: "."` and `paths: { "@/*": ["./src/*"] }`.
- `vite.config.ts`: `resolve.alias`. Both the client (`vite build`) and SSR (`vite build --ssr`)
  use this config, so `@/components/ui/*` resolves in both bundles.

### 3.3 shadcn CLI

- Run via the project's runner (`pnpm dlx shadcn@latest`), per the shadcn skill.
- `init` with the neutral base color, non-interactively where possible (e.g. accept the Vite
  detection; the CLI writes `components.json`, `src/lib/utils.ts`, and merges the theme into
  `src/styles.css`). If a prompt blocks automation, set the equivalent `components.json` fields
  and CSS directly to match the CLI output (the plan pins the exact `components.json`).
- `add button card input textarea select badge separator` → source lands in `src/components/ui/`.

### 3.4 SSR compatibility

- shadcn/Radix primitives are SSR-safe (`renderToPipeableStream`/`hydrateRoot`). No change to
  `entry-server.tsx` / `entry-client.tsx` logic. `entry-client` already imports `./styles.css`
  (now the Tailwind entry); `entry-server` imports no CSS.
- The `dark` class is applied by the inline `index.html` script before hydration, so server HTML
  and the first client paint agree (the toggle only mutates it afterward). React hydration is not
  affected because the class lives on `<html>`, outside the hydrated root (`#root`).

## 4. Component mapping

Layout shell (`App.tsx`): `<main className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">`,
header row (`flex items-center justify-between`) with the title link + `<ThemeToggle/>`.

| Current                  | shadcn / Tailwind                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostList` container     | `flex flex-col gap-4`; maps `posts` → `<PostItem/>`                                                                                                                       |
| `PostItem` `.post-card`  | `Card`: `CardHeader`(`CardTitle`=title link, `CardDescription`=author), `CardContent`=excerpt, `CardFooter`=Edit/Delete `Button`s (`variant="outline"`/`variant="ghost"`) |
| `UpdatesBadge`           | `Button variant="secondary" size="sm"` with `<RefreshCw data-icon="inline-start" />` → `{n} new {noun}s · refresh`; hidden when `n<=0`                                    |
| `NewPostForm`            | `Card` + `CardHeader`(title) + `CardContent`(`Select` author, `Input` title, `Textarea` body, submit `Button` with `Plus`)                                                |
| `EditPostForm`           | inline `Card`/`div` with `Input` title, `Textarea` body, Save `Button`                                                                                                    |
| `AddCommentForm`         | `Input` name + `Textarea` + `Button`                                                                                                                                      |
| `CommentItem` `.comment` | bordered row (`rounded-md border p-3 flex flex-col gap-1`): author `font-medium`, body `text-muted-foreground`, `Button variant="ghost" size="icon"` + `Trash2`           |
| `.post-meta`             | `text-muted-foreground text-sm`                                                                                                                                           |
| loading slot             | `<p className="text-muted-foreground">Loading…</p>`                                                                                                                       |
| error slot               | `<p className="text-destructive">Failed to load.</p>` + retry `Button variant="outline" size="sm"`                                                                        |
| back link (detail)       | `Button variant="ghost" size="sm"` + `ArrowLeft` → `navigate("/")`                                                                                                        |

Rules honored: semantic color tokens only (`bg-background`, `text-muted-foreground`,
`text-destructive`), `gap-*` (never `space-*`), `size-*` for square, `cn()` for conditional
classes, lucide icons via `data-icon` inside `Button` (no sizing classes on icons), `Card`
composition, `Select` uses `SelectGroup`/`SelectItem`, `Separator` instead of `<hr>` where a rule
is needed.

## 5. `ThemeToggle` (`src/components/ThemeToggle.tsx`)

```tsx
"use client"; // (harmless in a non-RSC app; documents client-only)
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Moon /> : <Sun />}
    </Button>
  );
}
```

`index.html` `<head>` inline script (before the client entry):

```html
<script>
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches))
      document.documentElement.classList.add("dark");
  } catch (e) {}
</script>
```

## 6. Files touched

- **Modify:** `package.json` (deps), `vite.config.ts` (tailwind plugin + alias),
  `tsconfig.app.json` (paths), `src/styles.css` (Tailwind + theme), `index.html` (theme script),
  and all 8 `src/components/*.tsx`.
- **Create (by CLI):** `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,card,input,
textarea,select,badge,separator}.tsx`.
- **Create:** `src/components/ThemeToggle.tsx`.
- **Unchanged:** `src/App.tsx` gets the header + toggle but keeps its router; everything under
  `src/blog/`, `src/routes.ts`, `src/live-singleton.ts`, `src/entry-*.tsx` (aside from CSS import
  already present), and all of `server/` stays as-is.

## 7. Error handling & testing

- Loading/error render through the existing `Pending` slots (plain Tailwind text + retry Button).
  No new error paths.
- **Gates:** `pnpm --filter vite-blog-framework check-types`, `lint`, and the dual
  `build` (client + SSR bundles must both emit, now with Tailwind CSS + shadcn components). The
  server smoke test is unaffected. Manual acceptance = the two-tab live demo still works and now
  looks like shadcn, with a working light/dark toggle.
- README: add a line noting the UI is built with shadcn/ui + Tailwind, and mention the theme
  toggle.

## 8. Self-review notes

- **Scope:** one example, presentation-only; a single implementation plan. No framework-package
  changes.
- **Consistency:** follows the shadcn skill's rules (semantic tokens, composition, icons, forms
  kept simple by explicit non-goal). CLI-first setup per the skill.
- **Ambiguity resolved:** live counter = `Button` (clickable refresh), base color = `neutral`,
  create/edit = inline (no Dialog), dark mode = manual class toggle + pre-paint script (no
  `next-themes`).
- **Risk:** the one non-trivial piece is the Tailwind-v4 + `@/` alias working across the SSR
  build; the plan verifies via the SSR bundle emitting. If `shadcn init`'s interactivity blocks
  automation, the plan falls back to writing `components.json` + CSS directly (pinned values).
