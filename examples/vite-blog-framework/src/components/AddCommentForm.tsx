import { useState } from "react";
import { addComment } from "../blog/api-client.js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AddCommentForm({ postId }: { postId: string }) {
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!author.trim() || !body.trim()) return;
    await addComment(postId, { author: author.trim(), body: body.trim() });
    setAuthor("");
    setBody("");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your comment…" />
      <Button type="submit" size="sm" className="self-start">
        Post comment
      </Button>
    </form>
  );
}
