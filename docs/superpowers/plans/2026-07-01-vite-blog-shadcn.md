# vite-blog-framework shadcn UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `examples/vite-blog-framework`'s hand-rolled UI to shadcn/ui (Tailwind v4) — core components (`Button`/`Card`/`Input`/`Textarea`/`Select`/`Badge`/`Separator`) + a light/dark toggle — with the data/live wiring untouched.

**Architecture:** Set up Tailwind v4 (`@tailwindcss/vite`) + the `@/*` path alias (works in the client AND SSR Vite builds), run the shadcn CLI to generate `components.json`/`lib/utils`/theme + add components, then rewrite the 8 UI components with shadcn primitives following the shadcn skill's rules (semantic tokens, `gap-*`, `cn()`, Card composition, lucide icons). Presentation-only: no changes to states/resources/server/live protocol.

**Tech Stack:** Vite 6 SSR, React 19, Tailwind v4, shadcn/ui, lucide-react, and the existing `rxfy`/`rxfy-react`/`rxfy-server`/`rxfy-ws`.

Spec: `docs/superpowers/specs/2026-07-01-vite-blog-shadcn-design.md`. There are no unit tests (UI-only); the gates are `check-types`, `lint`, and the dual Vite `build` (client + SSR bundles). **Invoke the `shadcn` skill when running its CLI** so setup follows current guidance.

---

## File Structure

| File                                                                                                                 | Change                                    |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `package.json`                                                                                                       | +tailwind/shadcn deps (CLI-installed)     |
| `vite.config.ts`                                                                                                     | +`@tailwindcss/vite` plugin, +`@/` alias  |
| `tsconfig.app.json`                                                                                                  | +`baseUrl`/`paths` for `@/*`              |
| `src/styles.css`                                                                                                     | becomes the Tailwind entry + shadcn theme |
| `index.html`                                                                                                         | +pre-paint dark-mode script               |
| `components.json`, `src/lib/utils.ts`, `src/components/ui/*`                                                         | CLI-generated                             |
| `src/components/ThemeToggle.tsx`                                                                                     | new                                       |
| `src/App.tsx`                                                                                                        | header + toggle (router unchanged)        |
| `src/components/{UpdatesBadge,PostList,PostItem,NewPostForm,EditPostForm,PostDetail,CommentItem,AddCommentForm}.tsx` | rewritten with shadcn                     |
| `README.md`                                                                                                          | note the shadcn UI + toggle               |

---

## Task 1: shadcn + Tailwind setup

**Files:** `package.json`, `vite.config.ts`, `tsconfig.app.json`, `src/styles.css`, `components.json`, `src/lib/utils.ts`, `src/components/ui/*`.

- [ ] **Step 1: run the shadcn CLI init (non-interactive), from the example dir**

Invoke the `shadcn` skill first (it provides the current CLI guidance). Then, from `examples/vite-blog-framework`:

```bash
cd examples/vite-blog-framework
pnpm dlx shadcn@latest init -b neutral -y
```

This installs Tailwind v4 + shadcn runtime deps (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, `@tailwindcss/vite`), writes `components.json`, `src/lib/utils.ts` (`cn`), and the theme CSS. If `-y` still prompts, add `-d` (defaults). Report exactly which files it created/modified (esp. whether it wrote the CSS to `src/styles.css` or a new `src/index.css`, and whether it touched `vite.config.ts`/`tsconfig*.json`).

- [ ] **Step 2: reconcile `vite.config.ts`** to EXACTLY:

```ts
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: reconcile `tsconfig.app.json`** — add `baseUrl` + `paths` to `compilerOptions` (keep every existing option):

```jsonc
  // inside "compilerOptions", add:
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 4: ensure the Tailwind entry is `src/styles.css`** (the file `entry-client.tsx` imports)

`entry-client.tsx` imports `./styles.css`. If the CLI wrote the theme to `src/index.css`, MOVE its contents into `src/styles.css` and delete `src/index.css`. `src/styles.css` must start with (CLI writes the `:root`/`.dark`/`@theme` blocks — keep them):

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* :root { … } .dark { … } @theme inline { … }  — shadcn neutral theme, written by the CLI */
```

Remove any leftover hand-rolled classes from the old `styles.css` (the old `.container`/`.post-card`/etc. rules) — they're replaced by Tailwind/shadcn.

- [ ] **Step 5: verify `components.json`** points Tailwind css at `src/styles.css` and uses the `@/` aliases + lucide. It should look like:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

If the CLI set `tailwind.css` to `src/index.css`, change it to `src/styles.css` (matching Step 4).

- [ ] **Step 6: add the components**

```bash
pnpm dlx shadcn@latest add button card input textarea select badge separator -y
```

Confirm `src/components/ui/{button,card,input,textarea,select,badge,separator}.tsx` exist.

- [ ] **Step 7: verify build + types (components not yet rewritten — that's fine)**

Run: `pnpm --filter vite-blog-framework check-types && pnpm --filter vite-blog-framework build`
Expected: check-types 0 errors (the generated `ui/*` + `lib/utils` typecheck; the still-old app components with stale classNames still compile), and BOTH client + SSR bundles emit (Tailwind now compiles into the client CSS). Lint may warn on generated `ui/*` files — the eslint config already ignores `dist`; if `ui/*` trips rules, add `"src/components/ui/**"` to the `ignores` array in `eslint.config.ts` (shadcn-generated code is not linted by convention). Run `pnpm --filter vite-blog-framework lint` and add that ignore if needed.

- [ ] **Step 8: commit**

```bash
git add examples/vite-blog-framework
git commit -m "chore(example): set up Tailwind v4 + shadcn/ui (neutral)"
```

---

## Task 2: dark-mode toggle + app shell

**Files:** `src/components/ThemeToggle.tsx` (new), `index.html`, `src/App.tsx`.

- [ ] **Step 1: `src/components/ThemeToggle.tsx`**

```tsx
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
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
    setDark(next);
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Moon /> : <Sun />}
    </Button>
  );
}
```

- [ ] **Step 2: add the pre-paint script to `index.html`** — inside `<head>`, BEFORE `<!--app-head-->`:

```html
<script>
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches))
      document.documentElement.classList.add("dark");
  } catch (e) {}
</script>
```

(This sets the class before hydration so SSR HTML and the first client paint agree; the class lives on `<html>`, outside the hydrated `#root`.)

- [ ] **Step 3: rewrite `src/App.tsx`** (keep the router; add the shell + toggle)

```tsx
import { useEffect, useState } from "react";
import { PostDetail } from "./components/PostDetail.js";
import { PostList } from "./components/PostList.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { bindNavigation, navigate } from "./navigation.js";
import { matchRoute } from "./routes.js";

export function App({ url }: { url: string }) {
  const [path, setPath] = useState(() => new URL(url, "http://localhost").pathname);

  useEffect(() => {
    const unbind = bindNavigation(setPath);
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      unbind();
    };
  }, []);

  const route = matchRoute(path);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="text-xl font-semibold"
        >
          rxfy live blog
        </a>
        <ThemeToggle />
      </header>
      {route.name === "home" && <PostList />}
      {route.name === "post" && <PostDetail postId={route.postId} />}
      {route.name === "not-found" && <p className="text-muted-foreground">Not found.</p>}
    </main>
  );
}
```

- [ ] **Step 4: verify + commit**
      Run: `pnpm --filter vite-blog-framework check-types` (0 errors) and `pnpm --filter vite-blog-framework lint` (clean; `eslint . --fix` first if needed).

```bash
git add examples/vite-blog-framework/src/components/ThemeToggle.tsx examples/vite-blog-framework/index.html examples/vite-blog-framework/src/App.tsx
git commit -m "feat(example): dark-mode toggle and shadcn app shell"
```

---

## Task 3: posts screen (UpdatesBadge, PostList, PostItem, forms)

**Files:** `src/components/{UpdatesBadge,PostList,PostItem,NewPostForm,EditPostForm}.tsx`.

- [ ] **Step 1: `UpdatesBadge.tsx`**

```tsx
import { RefreshCw } from "lucide-react";
import { useObservable } from "rxfy-react";
import type { Observable } from "rxjs";
import { Button } from "@/components/ui/button";

export function UpdatesBadge({
  available$,
  onApply,
  noun,
}: {
  available$: Observable<number>;
  onApply: () => void;
  noun: string;
}) {
  const n = useObservable(available$, 0);
  if (n <= 0) return null;
  return (
    <Button variant="secondary" size="sm" onClick={onApply}>
      <RefreshCw data-icon="inline-start" />
      {n} new {noun}
      {n === 1 ? "" : "s"} · refresh
    </Button>
  );
}
```

- [ ] **Step 2: `NewPostForm.tsx`**

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { createPost } from "../blog/api-client.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const AUTHORS = [
  { id: "u1", name: "Alice Doe" },
  { id: "u2", name: "Bob Smith" },
  { id: "u3", name: "Carol Lee" },
];

export function NewPostForm() {
  const [authorId, setAuthorId] = useState("u1");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    await createPost({ authorId, title: title.trim(), body: body.trim() });
    setTitle("");
    setBody("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Select value={authorId} onValueChange={setAuthorId}>
            <SelectTrigger>
              <SelectValue placeholder="Author" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {AUTHORS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" />
          <Button type="submit" className="self-start">
            <Plus data-icon="inline-start" />
            Publish
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `EditPostForm.tsx`**

```tsx
import { useState } from "react";
import { editPost } from "../blog/api-client.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function EditPostForm({
  id,
  title: initialTitle,
  body: initialBody,
  onDone,
}: {
  id: string;
  title: string;
  body: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await editPost(id, { title: title.trim(), body: body.trim() });
    onDone();
  };

  return (
    <form className="flex flex-col gap-3 pt-3" onSubmit={submit}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: `PostItem.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Pending, useModelStore } from "rxfy-react";
import { deletePost } from "../blog/api-client.js";
import { postModel, userModel } from "../blog/resources.js";
import { navigate } from "../navigation.js";
import { EditPostForm } from "./EditPostForm.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function PostItem({ id }: { id: string }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  return (
    <Pending value$={post$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(post) => (
        <Card>
          <CardHeader>
            <CardTitle>
              <a
                href={`/posts/${post.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/posts/${post.id}`);
                }}
                className="hover:underline"
              >
                {post.title}
              </a>
            </CardTitle>
            <CardDescription>
              <Author authorId={post.authorId} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{post.body.slice(0, 140)}…</p>
            {editing && (
              <EditPostForm id={post.id} title={post.title} body={post.body} onDone={() => setEditing(false)} />
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil data-icon="inline-start" />
              {editing ? "Close" : "Edit"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void deletePost(post.id)}>
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </CardFooter>
        </Card>
      )}
    </Pending>
  );
}

function Author({ authorId }: { authorId: string }) {
  const store = useModelStore(userModel);
  const author$ = useMemo(() => store.get(authorId), [store, authorId]);
  return (
    <Pending value$={author$} pending={<span>…</span>}>
      {(a) => <span>by {a.name}</span>}
    </Pending>
  );
}
```

- [ ] **Step 5: `PostList.tsx`**

```tsx
import { Pending, useStateData } from "rxfy-react";
import { fetchPosts } from "../blog/api-client.js";
import { postsState } from "../blog/states.js";
import { NewPostForm } from "./NewPostForm.js";
import { PostItem } from "./PostItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";
import { Button } from "@/components/ui/button";

export function PostList() {
  const handle = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });

  return (
    <div className="flex flex-col gap-4">
      <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="post" />
      <NewPostForm />
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading posts…</p>}
        rejected={() => (
          <p className="text-destructive">
            Failed to load.{" "}
            <Button variant="outline" size="sm" onClick={handle.reload}>
              Retry
            </Button>
          </p>
        )}
      >
        {({ posts }) =>
          posts.length === 0 ? (
            <p className="text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {posts.map((id) => (
                <PostItem key={id} id={id} />
              ))}
            </div>
          )
        }
      </Pending>
    </div>
  );
}
```

- [ ] **Step 6: verify + commit**
      Run: `pnpm --filter vite-blog-framework check-types` (0 errors) and `pnpm --filter vite-blog-framework lint` (`eslint . --fix` then re-lint; clean).

```bash
git add examples/vite-blog-framework/src/components/UpdatesBadge.tsx examples/vite-blog-framework/src/components/NewPostForm.tsx examples/vite-blog-framework/src/components/EditPostForm.tsx examples/vite-blog-framework/src/components/PostItem.tsx examples/vite-blog-framework/src/components/PostList.tsx
git commit -m "feat(example): shadcn posts list, cards, and forms"
```

---

## Task 4: detail screen (PostDetail, CommentItem, AddCommentForm)

**Files:** `src/components/{PostDetail,CommentItem,AddCommentForm}.tsx`.

- [ ] **Step 1: `AddCommentForm.tsx`**

```tsx
import { useState } from "react";
import { addComment } from "../blog/api-client.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AddCommentForm({ postId }: { postId: string }) {
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!author.trim() || !body.trim()) return;
    await addComment(postId, { author: author.trim(), body: body.trim() });
    setAuthor("");
    setBody("");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your comment…" />
      <Button type="submit" size="sm" className="self-start">
        Post comment
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: `CommentItem.tsx`**

```tsx
import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Pending, useModelStore } from "rxfy-react";
import { deleteComment } from "../blog/api-client.js";
import { commentModel } from "../blog/resources.js";
import { Button } from "@/components/ui/button";

export function CommentItem({ id, postId }: { id: string; postId: string }) {
  const store = useModelStore(commentModel);
  const comment$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={comment$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(comment) => (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">{comment.author}</p>
            <p className="text-muted-foreground">{comment.body}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete comment"
            onClick={() => void deleteComment(postId, comment.id)}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </Pending>
  );
}
```

- [ ] **Step 3: `PostDetail.tsx`**

```tsx
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { combineLatest } from "rxjs";
import { fetchPostDetail } from "../blog/api-client.js";
import { postModel, userModel } from "../blog/resources.js";
import { postDetailState } from "../blog/states.js";
import { navigate } from "../navigation.js";
import { AddCommentForm } from "./AddCommentForm.js";
import { CommentItem } from "./CommentItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function PostDetail({ postId }: { postId: string }) {
  const params = useMemo(() => ({ postId }), [postId]);
  const handle = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft data-icon="inline-start" />
          All posts
        </Button>
        <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="comment" />
      </div>
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading…</p>}
        rejected={() => (
          <p className="text-destructive">
            Failed to load.{" "}
            <Button variant="outline" size="sm" onClick={handle.reload}>
              Retry
            </Button>
          </p>
        )}
      >
        {(ids) => <Article ids={ids} postId={postId} />}
      </Pending>
    </div>
  );
}

function Article({ ids, postId }: { ids: { post: string; author: string; comments: string[] }; postId: string }) {
  const postStore = useModelStore(postModel);
  const userStore = useModelStore(userModel);
  const both$ = useMemo(
    () => combineLatest({ post: postStore.get(ids.post), author: userStore.get(ids.author) }),
    [postStore, userStore, ids.post, ids.author],
  );

  return (
    <Pending value$={both$}>
      {({ post, author }) => (
        <Card>
          <CardHeader>
            <CardTitle>{post.title}</CardTitle>
            <p className="text-muted-foreground text-sm">by {author.name}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p>{post.body}</p>
            <Separator />
            <h3 className="font-medium">Comments ({ids.comments.length})</h3>
            <div className="flex flex-col gap-2">
              {ids.comments.map((cid) => (
                <CommentItem key={cid} id={cid} postId={postId} />
              ))}
            </div>
            <AddCommentForm postId={postId} />
          </CardContent>
        </Card>
      )}
    </Pending>
  );
}
```

- [ ] **Step 4: verify + commit**
      Run: `pnpm --filter vite-blog-framework check-types` (0 errors) and `pnpm --filter vite-blog-framework lint` (`eslint . --fix` then re-lint; clean).

```bash
git add examples/vite-blog-framework/src/components/AddCommentForm.tsx examples/vite-blog-framework/src/components/CommentItem.tsx examples/vite-blog-framework/src/components/PostDetail.tsx
git commit -m "feat(example): shadcn post detail and comments"
```

---

## Task 5: final verification + README

**Files:** `README.md`.

- [ ] **Step 1: confirm no stale CSS classes / old styles remain**
      Run: `grep -rn 'className="\(container\|post-card\|post-list\|form\|badge-button\|comment\|status\|post-meta\|actions\|comment-list\|comment-author\)"' examples/vite-blog-framework/src || echo "no stale classes (good)"`
      Expected: `no stale classes (good)`. If any remain, they're leftover from an un-rewritten component — fix it.

- [ ] **Step 2: full gates**
      Run: `pnpm --filter vite-blog-framework check-types && pnpm --filter vite-blog-framework lint && pnpm --filter vite-blog-framework build`
      Expected: types clean, lint clean, and BOTH `dist/client` + `dist/server` bundles emit (the client CSS now includes Tailwind + the shadcn theme). PGlite chunk/eval warnings during the client build are pre-existing and unrelated.

- [ ] **Step 3: README note** — add a short paragraph under the stack/description:

  > The UI is built with **shadcn/ui** (Tailwind v4) — `Card`/`Button`/`Input`/`Textarea`/`Select` components, semantic theme tokens, and a light/dark toggle in the header (persisted to `localStorage`). The data + live wiring is unchanged.

- [ ] **Step 4: commit**

```bash
git add examples/vite-blog-framework/README.md
git commit -m "docs(example): note shadcn UI in README"
```

---

## Self-Review Notes

- **Spec coverage:** setup (Task 1: Tailwind v4 + `@/` alias + `shadcn init` + `add` + reconcile), dark toggle + shell (Task 2), core-component rewrites (Tasks 3–4: `Card`/`Button`/`Input`/`Textarea`/`Select`/`Separator`, counter as `Button`, loading/error as plain text, lucide icons via `data-icon`), delete stale CSS + gates + README (Task 5). Data/live wiring untouched. Non-goals (Field/Skeleton/Alert/Dialog/sonner/next-themes) are respected.
- **Rules honored:** semantic tokens (`text-muted-foreground`/`text-destructive`/`bg-*`), `gap-*` (no `space-*`), `size-icon` buttons, Card composition, `SelectItem` inside `SelectGroup`, icons via `data-icon` (no icon sizing classes), `Separator` not `<hr>`.
- **Risk pinned:** Task 1 explicitly reconciles whatever `shadcn init` generates (CSS file location, vite/tsconfig edits) to the exact target config, so the CLI's variability can't leave the build in a bad state; the `@/` alias is set in BOTH `vite.config.ts` (client + SSR builds) and `tsconfig.app.json` (types).
- **Type consistency:** the 8 component prop signatures (`UpdatesBadge`'s `{available$,onApply,noun}`, `PostItem {id}`, `EditPostForm {id,title,body,onDone}`, `CommentItem {id,postId}`, `PostDetail {postId}`, `Article {ids,postId}`) are unchanged from the working pre-shadcn versions — only the JSX bodies change — so the data wiring stays valid.
