"use client";
import { type ReactNode, useMemo } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { type PostId, postModel, type UserId, userModel } from "../data/models";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { useBlog } from "./BlogContext";

export function PostItem({ id, actions }: { id: PostId; actions?: ReactNode }) {
  const { navigate } = useBlog();
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
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
              <Author userId={post.userId} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{post.body.slice(0, 140)}…</p>
          </CardContent>
          {actions && <CardFooter className="gap-2">{actions}</CardFooter>}
        </Card>
      )}
    </Pending>
  );
}

function Author({ userId }: { userId: UserId }) {
  const store = useModelStore(userModel);
  const author$ = useMemo(() => store.get(userId), [store, userId]);
  return (
    <Pending value$={author$} pending={<span>…</span>}>
      {(a) => <span>by {a.name}</span>}
    </Pending>
  );
}
