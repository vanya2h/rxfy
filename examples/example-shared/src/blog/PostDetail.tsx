"use client";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import type { NormalizedOf } from "rxfy";
import { Pending, useAtom, useModelStore } from "rxfy-react";
import { type CommentId, postModel, userModel } from "../data/models";
import type { postDetailState } from "../data/states";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { AddCommentForm } from "./AddCommentForm";
import { useBlog } from "./BlogContext";
import { CommentItem } from "./CommentItem";
import { type StateControls, type StateHandleFor } from "./PostList";
import { UpdatesBadge } from "./UpdatesBadge";

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
  ids: NormalizedOf<typeof postDetailState>;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId, controls: StateControls) => ReactNode;
  controls: StateControls;
}) {
  const postStore = useModelStore(postModel);
  const userStore = useModelStore(userModel);
  // `ids.post` is a branded ref carrying the joined view, so `get` returns a post whose `author` and
  // `comments` (each already joined with its own author) are required here — no `!`, no fallback.
  const [post] = useAtom(postStore.get(ids.post));
  const [author] = useAtom(userStore.get(post.author));

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
        <h3 className="font-medium">Comments ({post.comments.length})</h3>
        <div className="flex flex-col gap-2">
          {[...post.comments].reverse().map((cid) => (
            <CommentItem key={cid} id={cid} actions={renderCommentActions?.(cid, controls)} />
          ))}
        </div>
        <AddCommentForm postId={post.id} onSubmitted={controls.applyUpdates} />
      </CardContent>
    </Card>
  );
}
