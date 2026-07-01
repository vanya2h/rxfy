import { type PostId, postModel } from "examples-shared/data";
import { Button } from "examples-shared/ui/button";
import { useMemo, useState } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { deletePost } from "../blog/api-client.js";
import { EditPostForm } from "./EditPostForm.js";

export function PostActions({ id, onDeleted }: { id: PostId; onDeleted?: () => void }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Pending value$={post$} pending={null}>
        {(post) => <EditPostForm id={post.id} title={post.title} body={post.body} onDone={() => setEditing(false)} />}
      </Pending>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void deletePost(id).then(() => onDeleted?.())}>
        Delete
      </Button>
    </>
  );
}
