"use client";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Pending, useAtom, useModelStore } from "rxfy-react";
import {
  type Comment,
  type CommentId,
  type Post,
  type PostId,
  postModel,
  type User,
  type UserId,
  userModel,
} from "../data/models";
import type { postDetailState } from "../data/states";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { AddCommentForm } from "./AddCommentForm";
import { useBlog } from "./BlogContext";
import { CommentItem } from "./CommentItem";
import { type StateControls, type StateHandleFor } from "./PostList";
import { UpdatesBadge } from "./UpdatesBadge";

export type PostDetailData = { post: Post; author: User; comments: Comment[] };
export type PostDetailFetcher = (params: { postId: PostId }, signal: AbortSignal) => Promise<PostDetailData>;
type DetailIds = { post: PostId; author: UserId; comments: CommentId[] };

export function PostDetail({
  detail,
  actions,
  renderCommentActions,
}: {
  /** The host-owned `useStateData` handle for `postDetailState` — this component only renders it. */
  detail: StateHandleFor<typeof postDetailState>;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId, controls: StateControls) => ReactNode;
}) {
  const { navigate } = useBlog();
  const controls = useMemo<StateControls>(
    () => ({ reload: detail.reload, applyUpdates: detail.applyUpdates }),
    [detail.reload, detail.applyUpdates],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft data-icon="inline-start" />
          All posts
        </Button>
        <UpdatesBadge available$={detail.updatesAvailable$} onApply={detail.applyUpdates} noun="comment" />
      </div>
      <Pending
        value$={detail.data$}
        pending={<p className="text-muted-foreground">Loading…</p>}
        rejected={() => <p className="text-destructive">Failed to load.</p>}
      >
        {(ids) => (
          <Article ids={ids} actions={actions} renderCommentActions={renderCommentActions} controls={controls} />
        )}
      </Pending>
    </div>
  );
}

function Article({
  ids,
  actions,
  renderCommentActions,
  controls,
}: {
  ids: DetailIds;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId, controls: StateControls) => ReactNode;
  controls: StateControls;
}) {
  const postStore = useModelStore(postModel);
  const userStore = useModelStore(userModel);
  const [post] = useAtom(postStore.get(ids.post));
  const [author] = useAtom(userStore.get(ids.author));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{post.title}</CardTitle>
        <CardDescription>by {author.name}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {actions}
        <p>{post.body}</p>
        <Separator />
        <h3 className="font-medium">Comments ({ids.comments.length})</h3>
        <div className="flex flex-col gap-2">
          {/* Newest first: sources return comments in insertion order (oldest→newest). */}
          {[...ids.comments].reverse().map((cid) => (
            <CommentItem key={cid} id={cid} actions={renderCommentActions?.(cid, controls)} />
          ))}
        </div>
        <AddCommentForm postId={post.id} onSubmitted={controls.applyUpdates} />
      </CardContent>
    </Card>
  );
}
