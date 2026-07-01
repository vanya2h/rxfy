import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { combineLatest } from "rxjs";
import { fetchPostDetail } from "../blog/api-client.js";
import { postModel, userModel } from "../blog/resources.js";
import { postDetailState } from "../blog/states.js";
import { navigate } from "../navigation.js";
import { AddCommentForm } from "./AddCommentForm.js";
import { CommentItem } from "./CommentItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function PostDetail({ postId }: { postId: string }) {
  const params = useMemo(() => ({ postId }), [postId]);
  const handle = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params });

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
        rejected={() => (
          <p className="text-destructive">
            Failed to load.{" "}
            <Button variant="outline" size="sm" onClick={handle.reload}>
              Retry
            </Button>
          </p>
        )}
      >
        {(ids) => <Article ids={ids} postId={postId} />}
      </Pending>
    </div>
  );
}

function Article({ ids, postId }: { ids: { post: string; author: string; comments: string[] }; postId: string }) {
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
            <p>{post.body}</p>
            <Separator />
            <h3 className="font-medium">Comments ({ids.comments.length})</h3>
            <div className="flex flex-col gap-2">
              {ids.comments.map((cid) => (
                <CommentItem key={cid} id={cid} postId={postId} />
              ))}
            </div>
            <AddCommentForm postId={postId} />
          </CardContent>
        </Card>
      )}
    </Pending>
  );
}
