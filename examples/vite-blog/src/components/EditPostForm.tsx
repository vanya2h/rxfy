import { Button } from "examples-shared/ui/button";
import { Input } from "examples-shared/ui/input";
import { Textarea } from "examples-shared/ui/textarea";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useApi } from "../blog/api-client.js";

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
  const api = useApi();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    await parseResponse(api.posts[":id"].$patch({ param: { id }, json: { title: title.trim(), body: body.trim() } }));
    onDone();
  };

  return (
    <form className="flex flex-col gap-3 pt-3" onSubmit={submit}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
