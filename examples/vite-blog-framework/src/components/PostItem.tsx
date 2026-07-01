import { useMemo, useState } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { deletePost } from "../blog/api-client.js";
import { postModel, userModel } from "../blog/resources.js";
import { navigate } from "../navigation.js";
import { EditPostForm } from "./EditPostForm.js";

export function PostItem({ id }: { id: string }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  return (
    <Pending value$={post$} pending={<li className="status">Loading…</li>}>
      {(post) => (
        <li className="post-card">
          <a
            href={`/posts/${post.id}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/posts/${post.id}`);
            }}
          >
            <h2>{post.title}</h2>
          </a>
          <Author authorId={post.authorId} />
          <p>{post.body.slice(0, 140)}…</p>
          <div className="actions">
            <button onClick={() => setEditing((v) => !v)}>{editing ? "Cancel" : "Edit"}</button>
            <button onClick={() => void deletePost(post.id)}>Delete</button>
          </div>
          {editing && (
            <EditPostForm id={post.id} title={post.title} body={post.body} onDone={() => setEditing(false)} />
          )}
        </li>
      )}
    </Pending>
  );
}

function Author({ authorId }: { authorId: string }) {
  const store = useModelStore(userModel);
  const author$ = useMemo(() => store.get(authorId), [store, authorId]);
  return (
    <Pending value$={author$} pending={<p className="post-meta">…</p>}>
      {(a) => <p className="post-meta">by {a.name}</p>}
    </Pending>
  );
}
