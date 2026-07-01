"use client";
import { type ReactNode, useMemo } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { type CommentId, commentModel } from "../data/models.js";

export function CommentItem({ id, actions }: { id: CommentId; actions?: ReactNode }) {
  const store = useModelStore(commentModel);
  const comment$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={comment$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(comment) => (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">{comment.name}</p>
            <p className="text-muted-foreground">{comment.body}</p>
          </div>
          {actions}
        </div>
      )}
    </Pending>
  );
}
