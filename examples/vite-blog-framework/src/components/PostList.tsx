import { Pending, useStateData } from "rxfy-react";
import { fetchPosts } from "../blog/api-client.js";
import { postsState } from "../blog/states.js";
import { NewPostForm } from "./NewPostForm.js";
import { PostItem } from "./PostItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";

export function PostList() {
  const handle = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });

  return (
    <div>
      <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="post" />
      <NewPostForm />
      <Pending
        value$={handle.data$}
        pending={<p className="status">Loading posts…</p>}
        rejected={() => (
          <p className="status error">
            Failed to load. <button onClick={handle.reload}>Retry</button>
          </p>
        )}
      >
        {({ posts }) =>
          posts.length === 0 ? (
            <p className="status">No posts yet.</p>
          ) : (
            <ul className="post-list">
              {posts.map((id) => (
                <PostItem key={id} id={id} />
              ))}
            </ul>
          )
        }
      </Pending>
    </div>
  );
}
