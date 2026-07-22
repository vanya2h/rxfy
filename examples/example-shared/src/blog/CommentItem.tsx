"use client";
import { type ReactNode } from "react";
import { useAtom, useModelStore } from "rxfy-react";
import { commentModel, userModel } from "../data/models";
import type { CommentRef } from "../data/states";

export function CommentItem({ id, actions }: { id: CommentRef; actions?: ReactNode }) {
  const store = useModelStore(commentModel);
  const userStore = useModelStore(userModel);
  // `id` is a branded ref from the joined query, so `get` returns a comment whose `author` is required.
  const [comment] = useAtom(store.get(id));
  const [author] = useAtom(userStore.get(comment.author));
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border p-3">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{author.name}</p>
        <p className="text-muted-foreground">{comment.body}</p>
      </div>
      {actions}
    </div>
  );
}
