"use client";

import { useMemo } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { Link } from "waku";
import { fetchPosts, type Post, type PostId, postModel, postsState, userModel } from "../blog";

export default function PostList() {
  const { data$, reload } = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });

  return (
    <div>
      <h1>Blog</h1>
      <Pending
        value$={data$}
        pending={<p className="status">Loading posts…</p>}
        rejected={() => (
          <p className="status error">
            Failed to load. <button onClick={reload}>Retry</button>
          </p>
        )}
      >
        {({ posts, meta }) =>
          posts.length === 0 ? (
            <p className="status">No posts yet.</p>
          ) : (
            <>
              <p className="meta">{meta.total} posts · loaded {new Date(meta.generatedAt).toLocaleTimeString()}</p>
              <ul className="post-list">
                {posts.map((id) => (
                  <PostItem key={id} id={id} />
                ))}
              </ul>
            </>
          )
        }
      </Pending>
    </div>
  );
}

function PostItem({ id }: { id: PostId }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={post$} pending={<li className="status">Loading…</li>}>
      {(post) => <PostItemContent post={post} />}
    </Pending>
  );
}

function PostItemContent({ post }: { post: Post }) {
  const userStore = useModelStore(userModel);
  const author$ = useMemo(() => userStore.get(post.userId), [userStore, post.userId]);

  return (
    <Pending value$={author$} pending={<li className="status">Loading…</li>}>
      {(author) => (
        <li>
          <Link to={`/posts/${post.id}`}>
            <h2>{post.title}</h2>
          </Link>
          <p className="post-meta">{author.name}</p>
          <p className="post-excerpt">{post.body.slice(0, 120)}…</p>
        </li>
      )}
    </Pending>
  );
}
