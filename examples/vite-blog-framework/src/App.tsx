import { BlogProvider, PostDetail, PostList } from "examples-shared";
import { type PostId } from "examples-shared/data";
import { useEffect, useState } from "react";
import { addComment, fetchPostDetail, fetchPosts } from "./blog/api-client.js";
import { CommentActions } from "./components/CommentActions.js";
import { NewPostForm } from "./components/NewPostForm.js";
import { PostActions } from "./components/PostActions.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { bindNavigation, navigate } from "./navigation.js";
import { matchRoute } from "./routes.js";

const blog = {
  navigate,
  onAddComment: async (postId: string, input: { name: string; body: string }) => {
    await addComment(postId, input);
  },
};

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
    <BlogProvider value={blog}>
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
        {route.name === "home" && (
          <PostList
            fetchPosts={fetchPosts}
            header={(c) => <NewPostForm onCreated={c.applyUpdates} />}
            renderItemActions={(id, c) => <PostActions id={id} onDeleted={c.applyUpdates} />}
          />
        )}
        {route.name === "post" && (
          <PostDetail
            postId={route.postId as PostId}
            fetchPostDetail={fetchPostDetail}
            renderCommentActions={(id, c) => (
              <CommentActions postId={route.postId} id={id} onDeleted={c.applyUpdates} />
            )}
          />
        )}
        {route.name === "not-found" && <p className="text-muted-foreground">Not found.</p>}
      </main>
    </BlogProvider>
  );
}
