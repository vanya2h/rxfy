"use client";
import { type ReactNode } from "react";
import { useAtom, useModelStore } from "rxfy-react";
import { type PostId, postModel, type UserId, userModel } from "../data/models";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { useBlog } from "./BlogContext";

export function PostItem({ id, actions }: { id: PostId; actions?: ReactNode }) {
  const { navigate } = useBlog();
  const store = useModelStore(postModel);
  const [post] = useAtom(store.get(id));
  return (
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
  );
}

function Author({ userId }: { userId: UserId }) {
  const store = useModelStore(userModel);
  const [author] = useAtom(store.get(userId));
  return <span>by {author.name}</span>;
}
