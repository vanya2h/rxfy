import { useState } from "react";
import { editPost } from "../blog/api-client.js";

export function EditPostForm({
  id,
  title: initialTitle,
  body: initialBody,
  onDone,
}: {
  id: string;
  title: string;
  body: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await editPost(id, { title: title.trim(), body: body.trim() });
    onDone();
  };

  return (
    <form className="form" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
}
