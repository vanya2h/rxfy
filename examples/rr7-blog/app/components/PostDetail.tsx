import { useMemo } from "react";
import { Link } from "react-router";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import {
  type Comment,
  type CommentId,
  commentModel,
  fetchPostDetail,
  type Post,
  postDetailState,
  type PostId,
  postModel,
  type User,
  type UserId,
  userModel,
} from "../blog";
import AddCommentForm from "./AddCommentForm";

type DetailIds = { post: PostId; author: UserId; comments: CommentId[] };

export default function PostDetail({ postId }: { postId: PostId }) {
  const params = useMemo(() => ({ postId }), [postId]);
  const { data$, mutations, reload } = useStateData(postDetailState, fetchPostDetail, params);

  return (
    <div>
      <Link className="back-link" to="/posts">
        ← All posts
      </Link>
      <Pending
        value$={data$}
        pending={<p className="status">Loading post…</p>}
        rejected={() => (
          <p className="status error">
            Failed to load. <button onClick={reload}>Retry</button>
          </p>
        )}
      >
        {(ids) => <PostBody ids={ids} postId={postId} onAddComment={mutations.addComment} />}
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
  postId: PostId;
  onAddComment: (comment: Comment) => void;
}) {
  const postStore = useModelStore(postModel);
  const post$ = useMemo(() => postStore.get(ids.post), [postStore, ids.post]);

  // Nest the two model lookups instead of combineLatest: combineLatest produces a
  // fresh, non-sync-marked observable, so Pending can't probe it synchronously and
  // never renders during buffered SSR. store.get() observables are sync-marked, so
  // nesting keeps the article server-rendered (matching the PostList pattern).
  return (
    <Pending value$={post$}>
      {(post) => (
        <AuthorGate
          authorId={ids.author}
          post={post}
          commentIds={ids.comments}
          postId={postId}
          onAddComment={onAddComment}
        />
      )}
    </Pending>
  );
}

function AuthorGate({
  authorId,
  post,
  commentIds,
  postId,
  onAddComment,
}: {
  authorId: UserId;
  post: Post;
  commentIds: CommentId[];
  postId: PostId;
  onAddComment: (comment: Comment) => void;
}) {
  const userStore = useModelStore(userModel);
  const author$ = useMemo(() => userStore.get(authorId), [userStore, authorId]);

  return (
    <Pending value$={author$}>
      {(author) => (
        <PostArticle post={post} author={author} commentIds={commentIds} postId={postId} onAddComment={onAddComment} />
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
  commentIds: CommentId[];
  postId: PostId;
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

function CommentItem({ id }: { id: CommentId }) {
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
