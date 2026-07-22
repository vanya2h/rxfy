"use client";
import { type ReactNode } from "react";
import { asKey } from "rxfy";
import { useAtom, useModelStore } from "rxfy-react";
import { type CommentId, commentModel } from "../data/models";

export function CommentItem({ id, actions }: { id: CommentId; actions?: ReactNode }) {
  const store = useModelStore(commentModel);
  const [comment] = useAtom(store.get(asKey(commentModel, id)));
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border p-3">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{comment.name}</p>
        <p className="text-muted-foreground">{comment.body}</p>
      </div>
      {actions}
    </div>
  );
}
