import { BlogProvider, PostDetail, PostList } from "examples-shared";
import { postDetailState, type PostId, postsState } from "examples-shared/data";
import { parseResponse } from "hono/client";
import { useMemo } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router";
import { useStateData } from "rxfy-react";
import { useApi } from "./blog/api-client.js";
import { CommentActions } from "./components/CommentActions.js";
import { NewPostForm } from "./components/NewPostForm.js";
import { PostActions } from "./components/PostActions.js";
import { ThemeToggle } from "./components/ThemeToggle.js";

function HomeRoute() {
  const api = useApi();
  const posts = useStateData({
    state: postsState,
    fetchFn: () => parseResponse(api.posts.$get()),
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

function PostRoute() {
  const { postId } = useParams<{ postId: string }>() as { postId: PostId };
  const api = useApi();
  const detail = useStateData({
    state: postDetailState,
    fetchFn: ({ postId }) => parseResponse(api.posts[":id"].$get({ param: { id: postId } })),
    params: { postId },
  });
  return (
    <PostDetail
      detail={detail}
      renderCommentActions={(id, c) => <CommentActions postId={postId} id={id} onDeleted={c.applyUpdates} />}
    />
  );
}

export function App() {
  const api = useApi();
  const navigate = useNavigate();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => void navigate(path),
      onAddComment: async (postId: string, input: { name: string; body: string }) => {
        await parseResponse(api.posts[":id"].comments.$post({ param: { id: postId }, json: input }));
      },
    }),
    [api, navigate],
  );

  return (
    <BlogProvider value={blog}>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-xl font-semibold">
            rxfy live blog
          </Link>
          <ThemeToggle />
        </header>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/posts/:postId" element={<PostRoute />} />
          <Route path="*" element={<p className="text-muted-foreground">Not found.</p>} />
        </Routes>
      </main>
    </BlogProvider>
  );
}
