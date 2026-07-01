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
