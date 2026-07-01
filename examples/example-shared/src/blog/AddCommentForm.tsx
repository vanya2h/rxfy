"use client";
import { useState } from "react";
import { type Comment } from "../data/models.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { useBlog } from "./BlogContext.js";

export function AddCommentForm({ postId, onAdded }: { postId: string; onAdded?: (comment: Comment) => void }) {
  const { onAddComment } = useBlog();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    const created = await onAddComment(postId, { name: name.trim(), body: body.trim() });
    if (created && onAdded) onAdded(created);
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
