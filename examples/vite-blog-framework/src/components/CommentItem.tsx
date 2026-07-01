import { Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { deleteComment } from "../blog/api-client.js";
import { commentModel } from "../blog/resources.js";

import { Button } from "@/components/ui/button";

export function CommentItem({ id, postId }: { id: string; postId: string }) {
  const store = useModelStore(commentModel);
  const comment$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={comment$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(comment) => (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">{comment.author}</p>
            <p className="text-muted-foreground">{comment.body}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete comment"
            onClick={() => void deleteComment(postId, comment.id)}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </Pending>
  );
}
