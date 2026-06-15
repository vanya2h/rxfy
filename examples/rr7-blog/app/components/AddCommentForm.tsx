import { useState } from "react";
import { type Comment, createComment, type PostId } from "../blog";

type AddCommentFormProps = {
  postId: PostId;
  onAdd: (comment: Comment) => void;
};

export default function AddCommentForm({ postId, onAdd }: AddCommentFormProps) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedBody = body.trim();
    if (!trimmedName || !trimmedBody) return;
    const comment = createComment(postId, trimmedName, trimmedBody);
    onAdd(comment);
    setName("");
    setBody("");
  };

  return (
    <form className="add-comment" onSubmit={handleSubmit}>
      <h3>Leave a comment</h3>
      <div>
        <label htmlFor="comment-name">Name</label>
        <input
          id="comment-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="comment-body">Comment</label>
        <textarea
          id="comment-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your comment…"
        />
      </div>
      <button type="submit">Post comment</button>
    </form>
  );
}
