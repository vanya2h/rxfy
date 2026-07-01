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

export function PostDetail({ postId }: { postId: string }) {
  const params = useMemo(() => ({ postId }), [postId]);
  const handle = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params });

  return (
    <div>
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
      >
        ← All posts
      </a>
      <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="comment" />
      <Pending
        value$={handle.data$}
        pending={<p className="status">Loading…</p>}
        rejected={() => (
          <p className="status error">
            Failed to load. <button onClick={handle.reload}>Retry</button>
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
        <article>
          <h1>{post.title}</h1>
          <p className="post-meta">by {author.name}</p>
          <p>{post.body}</p>
          <h3>Comments ({ids.comments.length})</h3>
          <ul className="comment-list">
            {ids.comments.map((cid) => (
              <CommentItem key={cid} id={cid} postId={postId} />
            ))}
          </ul>
          <AddCommentForm postId={postId} />
        </article>
      )}
    </Pending>
  );
}
