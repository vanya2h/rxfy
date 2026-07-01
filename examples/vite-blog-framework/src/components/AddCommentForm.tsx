import { useState } from "react";
import { addComment } from "../blog/api-client.js";

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
    <form className="form" onSubmit={submit}>
      <h3>Add a comment</h3>
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your comment…" />
      <button type="submit">Post comment</button>
    </form>
  );
}
