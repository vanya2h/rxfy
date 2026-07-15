import { Button } from "examples-shared/ui/button";
import { Input } from "examples-shared/ui/input";
import { parseResponse } from "hono/client";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useApi } from "./api-client.js";
import type { ColumnId } from "./models";

export function NewCardForm({ columnId, onCreated }: { columnId: ColumnId; onCreated: () => void }) {
  const api = useApi();
  const [title, setTitle] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    await parseResponse(api.cards.$post({ json: { columnId, title: t } }));
    onCreated(); // stale → applyUpdates refetches the id-list
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a card…"
        aria-label="New card title"
      />
      <Button type="submit" size="icon" aria-label="Add card">
        <Plus className="size-4" />
      </Button>
    </form>
  );
}
