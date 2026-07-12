"use client";
import { type ReactNode, useMemo } from "react";
import type { StateDescriptor } from "rxfy";
import { Pending, type StateHandle } from "rxfy-react";
import { type Post, type PostId, type User } from "../data/models";
import type { postsState } from "../data/states";
import { PostItem } from "./PostItem";
import { UpdatesBadge } from "./UpdatesBadge";

export type PostsData = { posts: Post[]; authors: User[]; meta: { total: number; generatedAt: string } };
export type PostsFetcher = (params: Record<never, never>, signal: AbortSignal) => Promise<PostsData>;
/** Imperative controls surfaced via `onReady` so a host can refresh the state after a local mutation. */
export type StateControls = { reload: () => void; applyUpdates: () => void };

/** The `useStateData` handle for a given state descriptor — what a host passes into a view. */
export type StateHandleFor<S> =
  S extends StateDescriptor<infer _TParams, infer TShape, infer TMutations, infer TQuery, infer TWritable>
    ? StateHandle<TShape, TMutations, TQuery, TWritable>
    : never;

export function PostList({
  posts,
  header,
  renderItemActions,
}: {
  /** The host-owned `useStateData` handle for `postsState` — this component only renders it. */
  posts: StateHandleFor<typeof postsState>;
  /** A node, or a render function receiving the state's refresh controls (e.g. for a "new post" form). */
  header?: ReactNode | ((controls: StateControls) => ReactNode);
  renderItemActions?: (id: PostId, controls: StateControls) => ReactNode;
}) {
  const controls = useMemo<StateControls>(
    () => ({ reload: posts.reload, applyUpdates: posts.applyUpdates }),
    [posts.reload, posts.applyUpdates],
  );
  return (
    <div className="flex flex-col gap-4">
      <UpdatesBadge available$={posts.updatesAvailable$} onApply={posts.applyUpdates} noun="post" />
      {typeof header === "function" ? header(controls) : header}
      <Pending
        value$={posts.data$}
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
              {/* Newest first: sources return rows in insertion order (oldest→newest). */}
              {[...posts].reverse().map((id) => (
                <PostItem key={id} id={id} actions={renderItemActions?.(id, controls)} />
              ))}
            </div>
          )
        }
      </Pending>
    </div>
  );
}
