import { Button } from "examples-shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "examples-shared/ui/card";
import { Input } from "examples-shared/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "examples-shared/ui/select";
import { Textarea } from "examples-shared/ui/textarea";
import { Plus } from "lucide-react";
import { useState } from "react";
import { createPost } from "../blog/api-client.js";

const AUTHORS = [
  { id: "u1", name: "Alice Doe" },
  { id: "u2", name: "Bob Smith" },
  { id: "u3", name: "Carol Lee" },
];

export function NewPostForm() {
  const [userId, setUserId] = useState("u1");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    await createPost({ userId, title: title.trim(), body: body.trim() });
    setTitle("");
    setBody("");
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>New post</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Select value={userId} onValueChange={setUserId}>
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
        </CardContent>
        <CardFooter>
          <Button type="submit">
            <Plus data-icon="inline-start" />
            Publish
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
