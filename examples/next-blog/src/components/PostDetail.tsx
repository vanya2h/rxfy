"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { combineLatest } from "rxjs";
import {
  commentModel,
  fetchPostDetail,
  postDetailState,
  postModel,
  userModel,
  type Comment,
  type Post,
  type User,
} from "../blog";
import AddCommentForm from "./AddCommentForm";

type DetailIds = { post: string; author: string; comments: string[] };

export default function PostDetail({ postId }: { postId: string }) {
  const params = useMemo(() => ({ postId }), [postId]);
  const { data$, mutations } = useStateData(postDetailState, fetchPostDetail, params);

  return (
    <div>
      <Link className="back-link" href="/">← All posts</Link>
      <Pending
        value$={data$}
        pending={<p className="status">Loading post…</p>}
        rejected={({ onReload }) => (
          <p className="status error">
            Failed to load.{" "}
            <button onClick={onReload}>Retry</button>
          </p>
        )}
      >
        {(ids) => (
          <PostBody
            ids={ids}
            postId={postId}
            onAddComment={mutations.addComment}
          />
        )}
      </Pending>
    </div>
  );
}

function PostBody({
  ids,
  postId,
  onAddComment,
}: {
  ids: DetailIds;
  postId: string;
  onAddComment: (comment: Comment) => void;
}) {
  const postStore = useModelStore(postModel);
  const userStore = useModelStore(userModel);

  const post$ = useMemo(() => postStore.get(ids.post), [postStore, ids.post]);
  const author$ = useMemo(() => userStore.get(ids.author), [userStore, ids.author]);
  const combined$ = useMemo(() => combineLatest({ post: post$, author: author$ }), [post$, author$]);

  return (
    <Pending value$={combined$}>
      {({ post, author }) => (
        <PostArticle
          post={post}
          author={author}
          commentIds={ids.comments}
          postId={postId}
          onAddComment={onAddComment}
        />
      )}
    </Pending>
  );
}

function PostArticle({
  post,
  author,
  commentIds,
  postId,
  onAddComment,
}: {
  post: Post;
  author: User;
  commentIds: string[];
  postId: string;
  onAddComment: (comment: Comment) => void;
}) {
  return (
    <article>
      <h1>{post.title}</h1>
      <div className="author-block">
        {author.name} · <a href={`mailto:${author.email}`}>{author.email}</a>
      </div>
      <p className="post-body">{post.body}</p>
      <section>
        <h2>Comments ({commentIds.length})</h2>
        {commentIds.length === 0 ? (
          <p className="status">No comments yet. Be the first!</p>
        ) : (
          <ul className="comment-list">
            {commentIds.map((id) => (
              <CommentItem key={id} id={id} />
            ))}
          </ul>
        )}
        <AddCommentForm postId={postId} onAdd={onAddComment} />
      </section>
    </article>
  );
}

function CommentItem({ id }: { id: string }) {
  const store = useModelStore(commentModel);
  const comment$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={comment$} pending={<li className="status">Loading…</li>}>
      {(comment) => (
        <li>
          <p className="comment-author">{comment.name}</p>
          <p className="comment-body">{comment.body}</p>
        </li>
      )}
    </Pending>
  );
}
