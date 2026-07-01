import { Pending, useStateData } from "rxfy-react";
import { fetchPosts } from "../blog/api-client.js";
import { postsState } from "../blog/states.js";
import { NewPostForm } from "./NewPostForm.js";
import { PostItem } from "./PostItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";

import { Button } from "@/components/ui/button";

export function PostList() {
  const handle = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });

  return (
    <div className="flex flex-col gap-4">
      <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="post" />
      <NewPostForm />
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading posts…</p>}
        rejected={() => (
          <p className="text-destructive">
            Failed to load.{" "}
            <Button variant="outline" size="sm" onClick={handle.reload}>
              Retry
            </Button>
          </p>
        )}
      >
        {({ posts }) =>
          posts.length === 0 ? (
            <p className="text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {posts.map((id) => (
                <PostItem key={id} id={id} />
              ))}
            </div>
          )
        }
      </Pending>
    </div>
  );
}
