"use client";
import { useState } from "react";
import { type Comment } from "../data/models";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useBlog } from "./BlogContext";

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
