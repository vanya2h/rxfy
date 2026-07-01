import { type CommentId } from "examples-shared/data";
import { Button } from "examples-shared/ui/button";
import { Trash2 } from "lucide-react";
import { deleteComment } from "../blog/api-client.js";

export function CommentActions({ postId, id }: { postId: string; id: CommentId }) {
  return (
    <Button variant="ghost" size="icon" onClick={() => void deleteComment(postId, id)} aria-label="Delete comment">
      <Trash2 />
    </Button>
  );
}
