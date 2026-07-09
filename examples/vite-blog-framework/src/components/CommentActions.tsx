import { type CommentId } from "examples-shared/data";
import { Button } from "examples-shared/ui/button";
import { Trash2 } from "lucide-react";
import { useApi } from "../blog/api-client.js";

export function CommentActions({ postId, id, onDeleted }: { postId: string; id: CommentId; onDeleted?: () => void }) {
  const api = useApi();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() =>
        void api.posts[":postId"].comments[":id"]
          .$delete({
            param: {
              postId,
              id,
            },
          })
          .then(() => onDeleted?.())
      }
      aria-label="Delete comment"
    >
      <Trash2 />
    </Button>
  );
}
