import { Button } from "examples-shared/ui/button";
import { Input } from "examples-shared/ui/input";
import { Textarea } from "examples-shared/ui/textarea";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useModelStore } from "rxfy-react";
import { useApi } from "./api-client.js";
import { type Card, cardModel } from "./models";

export function CardEditor({ card, onDone }: { card: Card; onDone: () => void }) {
  const api = useApi();
  const store = useModelStore(cardModel);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);

  const save = async () => {
    const next = { ...card, title: title.trim() || card.title, description };
    store.set(card.id, next); // optimistic in-place update
    onDone();
    await parseResponse(
      api.cards[":id"].$patch({ param: { id: card.id }, json: { title: next.title, description: next.description } }),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Card title" />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Card description"
        rows={2}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
