import { type PostId, postModel } from "examples-shared/data";
import { Button } from "examples-shared/ui/button";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useAtom, useModelStore } from "rxfy-react";
import { useApi } from "../blog/api-client.js";
import { EditPostForm } from "./EditPostForm.js";

export function PostActions({ id, onDeleted }: { id: PostId; onDeleted?: () => void }) {
  const api = useApi();
  const store = useModelStore(postModel);
  const [post] = useAtom(store.get(id));
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditPostForm id={post.id} title={post.title} body={post.body} onDone={() => setEditing(false)} />;
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void parseResponse(api.posts[":id"].$delete({ param: { id } })).then(() => onDeleted?.())}
      >
        Delete
      </Button>
    </>
  );
}
