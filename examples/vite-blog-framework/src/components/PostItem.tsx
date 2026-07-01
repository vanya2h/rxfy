import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { deletePost } from "../blog/api-client.js";
import { postModel, userModel } from "../blog/resources.js";
import { navigate } from "../navigation.js";
import { EditPostForm } from "./EditPostForm.js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function PostItem({ id }: { id: string }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  return (
    <Pending value$={post$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(post) => (
        <Card>
          <CardHeader>
            <CardTitle>
              <a
                href={`/posts/${post.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/posts/${post.id}`);
                }}
                className="hover:underline"
              >
                {post.title}
              </a>
            </CardTitle>
            <CardDescription>
              <Author authorId={post.authorId} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{post.body.slice(0, 140)}…</p>
            {editing && (
              <EditPostForm id={post.id} title={post.title} body={post.body} onDone={() => setEditing(false)} />
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil data-icon="inline-start" />
              {editing ? "Close" : "Edit"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void deletePost(post.id)}>
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </CardFooter>
        </Card>
      )}
    </Pending>
  );
}

function Author({ authorId }: { authorId: string }) {
  const store = useModelStore(userModel);
  const author$ = useMemo(() => store.get(authorId), [store, authorId]);
  return (
    <Pending value$={author$} pending={<span>…</span>}>
      {(a) => <span>by {a.name}</span>}
    </Pending>
  );
}
