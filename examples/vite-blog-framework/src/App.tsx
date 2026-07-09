import { BlogProvider, PostDetail, type PostDetailData, PostList, type PostsData } from "examples-shared";
import { postDetailState, type PostId, postsState } from "examples-shared/data";
import { useEffect, useMemo, useState } from "react";
import { useStateData } from "rxfy-react";
import { useApi } from "./blog/api-client.js";
import { CommentActions } from "./components/CommentActions.js";
import { NewPostForm } from "./components/NewPostForm.js";
import { PostActions } from "./components/PostActions.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { bindNavigation, navigate } from "./navigation.js";
import { matchRoute } from "./routes.js";

function HomeRoute() {
  const api = useApi();
  const posts = useStateData({
    state: postsState,
    // The wire shape is structurally identical to the branded state shape; re-view it.
    fetchFn: async () => {
      const res = await api.posts.$get();
      return (await res.json()) as unknown as PostsData;
    },
    params: {},
  });
  return (
    <PostList
      posts={posts}
      header={(c) => <NewPostForm onCreated={c.applyUpdates} />}
      renderItemActions={(id, c) => <PostActions id={id} onDeleted={c.applyUpdates} />}
    />
  );
}

function PostRoute({ postId }: { postId: PostId }) {
  const api = useApi();
  const detail = useStateData({
    state: postDetailState,
    fetchFn: async ({ postId }) => {
      const res = await api.posts[":id"].$get({ param: { id: postId } });
      if (!res.ok) throw new Error(`Post ${postId} not found`);
      return (await res.json()) as unknown as PostDetailData;
    },
    params: { postId },
  });
  return (
    <PostDetail
      detail={detail}
      renderCommentActions={(id, c) => <CommentActions postId={postId} id={id} onDeleted={c.applyUpdates} />}
    />
  );
}

export function App({ url }: { url: string }) {
  const api = useApi();
  const blog = useMemo(
    () => ({
      navigate,
      onAddComment: async (postId: string, input: { name: string; body: string }) => {
        await api.posts[":id"].comments.$post({ param: { id: postId }, json: input });
      },
    }),
    [api],
  );
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
        {route.name === "home" && <HomeRoute />}
        {route.name === "post" && <PostRoute postId={route.postId as PostId} />}
        {route.name === "not-found" && <p className="text-muted-foreground">Not found.</p>}
      </main>
    </BlogProvider>
  );
}
