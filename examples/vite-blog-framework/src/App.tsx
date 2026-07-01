import { useEffect, useState } from "react";
import { PostDetail } from "./components/PostDetail.js";
import { PostList } from "./components/PostList.js";
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
    <main className="container">
      <header>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <h1>rxfy live blog</h1>
        </a>
      </header>
      {route.name === "home" && <PostList />}
      {route.name === "post" && <PostDetail postId={route.postId} />}
      {route.name === "not-found" && <p className="status">Not found.</p>}
    </main>
  );
}
