import { useMemo } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { deleteComment } from "../blog/api-client.js";
import { commentModel } from "../blog/resources.js";

export function CommentItem({ id, postId }: { id: string; postId: string }) {
  const store = useModelStore(commentModel);
  const comment$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={comment$} pending={<li className="status">Loading…</li>}>
      {(comment) => (
        <li className="comment">
          <p className="comment-author">{comment.author}</p>
          <p>{comment.body}</p>
          <button onClick={() => deleteComment(postId, comment.id)}>Delete</button>
        </li>
      )}
    </Pending>
  );
}
