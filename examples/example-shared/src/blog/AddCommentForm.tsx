"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useBlog } from "./BlogContext";

/** `onSubmitted` fires after a successful add so the host can refresh the thread (e.g. refetch). */
export function AddCommentForm({ postId, onSubmitted }: { postId: string; onSubmitted?: () => void }) {
  const { onAddComment } = useBlog();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    await onAddComment(postId, { name: name.trim(), body: body.trim() });
    onSubmitted?.();
    setName("");
    setBody("");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your comment…" />
      <Button type="submit" size="sm" className="self-start">
        Post comment
      </Button>
    </form>
  );
}
