"use client";
import { type ReactNode, useEffect } from "react";
import { Pending, useStateData } from "rxfy-react";
import { type Post, type PostId, type User } from "../data/models";
import { postsState } from "../data/states";
import { PostItem } from "./PostItem";
import { UpdatesBadge } from "./UpdatesBadge";

export type PostsData = { posts: Post[]; authors: User[]; meta: { total: number; generatedAt: string } };
export type PostsFetcher = (params: Record<never, never>, signal: AbortSignal) => Promise<PostsData>;
/** Imperative controls surfaced via `onReady` so a host can refresh the state after a local mutation. */
export type StateControls = { reload: () => void; applyUpdates: () => void };

export function PostList({
  fetchPosts,
  header,
  renderItemActions,
  onReady,
}: {
  fetchPosts: PostsFetcher;
  header?: ReactNode;
  renderItemActions?: (id: PostId) => ReactNode;
  onReady?: (controls: StateControls) => void;
}) {
  const handle = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });
  const { reload, applyUpdates } = handle;
  useEffect(() => {
    onReady?.({ reload, applyUpdates });
  }, [onReady, reload, applyUpdates]);
  return (
    <div className="flex flex-col gap-4">
      <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="post" />
      {header}
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading posts…</p>}
        rejected={() => <p className="text-destructive">Failed to load.</p>}
      >
        {({ posts, meta }) =>
          posts.length === 0 ? (
            <p className="text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                {meta.total} posts · loaded {new Date(meta.generatedAt).toLocaleTimeString()}
              </p>
              {posts.map((id) => (
                <PostItem key={id} id={id} actions={renderItemActions?.(id)} />
              ))}
            </div>
          )
        }
      </Pending>
    </div>
  );
}
