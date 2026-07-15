import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "examples-shared/ui/button";
import { Card as UICard } from "examples-shared/ui/card";
import { parseResponse } from "hono/client";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAtom, useModelStore } from "rxfy-react";
import { useApi } from "./api-client.js";
import { CardEditor } from "./CardEditor.js";
import { type CardId, cardModel } from "./models";

export function Card({ id, onDeleted }: { id: CardId; onDeleted: () => void }) {
  const api = useApi();
  const store = useModelStore(cardModel);
  const [card] = useAtom(store.get(id));
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const remove = async () => {
    await parseResponse(api.cards[":id"].$delete({ param: { id } }));
    onDeleted();
  };

  // The shared Card UI is a plain (non-ref-forwarding) component, so the sortable node is a wrapper div.
  return (
    <div ref={setNodeRef} style={style}>
      <UICard size="sm" className="gap-2 px-3">
        {editing ? (
          <CardEditor card={card} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="cursor-grab touch-none font-medium" {...attributes} {...listeners}>
                {card.title}
              </span>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" aria-label="Edit card" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete card" onClick={remove}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {card.description ? <p className="text-muted-foreground text-sm">{card.description}</p> : null}
          </>
        )}
      </UICard>
    </div>
  );
}
