"use client";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { combineLatest } from "rxjs";
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
import { postDetailState } from "../data/states";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { AddCommentForm } from "./AddCommentForm";
import { useBlog } from "./BlogContext";
import { CommentItem } from "./CommentItem";
import { type StateControls } from "./PostList";
import { UpdatesBadge } from "./UpdatesBadge";

export type PostDetailData = { post: Post; author: User; comments: Comment[] };
export type PostDetailFetcher = (params: { postId: PostId }, signal: AbortSignal) => Promise<PostDetailData>;
type DetailIds = { post: PostId; author: UserId; comments: CommentId[] };

export function PostDetail({
  postId,
  fetchPostDetail,
  actions,
  renderCommentActions,
  onReady,
}: {
  postId: PostId;
  fetchPostDetail: PostDetailFetcher;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId) => ReactNode;
  onReady?: (controls: StateControls) => void;
}) {
  const { navigate } = useBlog();
  const params = useMemo(() => ({ postId }), [postId]);
  const handle = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params });
  const { reload, applyUpdates } = handle;
  useEffect(() => {
    onReady?.({ reload, applyUpdates });
  }, [onReady, reload, applyUpdates]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft data-icon="inline-start" />
          All posts
        </Button>
        <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="comment" />
      </div>
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading…</p>}
        rejected={() => <p className="text-destructive">Failed to load.</p>}
      >
        {(ids) => (
          <Article
            ids={ids}
            actions={actions}
            renderCommentActions={renderCommentActions}
            onAdded={handle.mutations.addComment}
          />
        )}
      </Pending>
    </div>
  );
}

function Article({
  ids,
  actions,
  renderCommentActions,
  onAdded,
}: {
  ids: DetailIds;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId) => ReactNode;
  onAdded?: (comment: Comment) => void;
}) {
  const postStore = useModelStore(postModel);
  const userStore = useModelStore(userModel);
  const both$ = useMemo(
    () => combineLatest({ post: postStore.get(ids.post), author: userStore.get(ids.author) }),
    [postStore, userStore, ids.post, ids.author],
  );
  return (
    <Pending value$={both$}>
      {({ post, author }) => (
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
              {ids.comments.map((cid) => (
                <CommentItem key={cid} id={cid} actions={renderCommentActions?.(cid)} />
              ))}
            </div>
            <AddCommentForm postId={post.id} onAdded={onAdded} />
          </CardContent>
        </Card>
      )}
    </Pending>
  );
}
