import { useState } from "react";
import { createPost } from "../blog/api-client.js";

const AUTHORS = [
  { id: "u1", name: "Alice Doe" },
  { id: "u2", name: "Bob Smith" },
  { id: "u3", name: "Carol Lee" },
];

export function NewPostForm() {
  const [authorId, setAuthorId] = useState("u1");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    await createPost({ authorId, title: title.trim(), body: body.trim() });
    setTitle("");
    setBody("");
  };

  return (
    <form className="form" onSubmit={submit}>
      <h3>New post</h3>
      <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
        {AUTHORS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" />
      <button type="submit">Publish</button>
    </form>
  );
}
