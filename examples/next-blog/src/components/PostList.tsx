"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { fetchPosts, postModel, postsState, type Post } from "../blog.js";

export default function PostList() {
  const { data$ } = useStateData(postsState, fetchPosts, {});

  return (
    <div>
      <h1>Blog</h1>
      <Pending
        value$={data$}
        pending={<p className="status">Loading posts…</p>}
        rejected={({ onReload }) => (
          <p className="status error">
            Failed to load.{" "}
            <button onClick={onReload}>Retry</button>
          </p>
        )}
      >
        {({ posts }) =>
          posts.length === 0 ? (
            <p className="status">No posts yet.</p>
          ) : (
            <ul className="post-list">
              {posts.map((id) => (
                <PostItem key={id} id={id} />
              ))}
            </ul>
          )
        }
      </Pending>
    </div>
  );
}

function PostItem({ id }: { id: string }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={post$}>
      {(post) => <PostItemContent post={post} />}
    </Pending>
  );
}

function PostItemContent({ post }: { post: Post }) {
  return (
    <li>
      <Link href={`/posts/${post.id}`}>
        <h2>{post.title}</h2>
      </Link>
      <p className="post-excerpt">{post.body.slice(0, 120)}…</p>
    </li>
  );
}
