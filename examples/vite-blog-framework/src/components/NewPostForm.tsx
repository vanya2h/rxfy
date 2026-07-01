import { Plus } from "lucide-react";
import { useState } from "react";
import { createPost } from "../blog/api-client.js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Select value={authorId} onValueChange={setAuthorId}>
            <SelectTrigger>
              <SelectValue placeholder="Author" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {AUTHORS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" />
          <Button type="submit" className="self-start">
            <Plus data-icon="inline-start" />
            Publish
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
