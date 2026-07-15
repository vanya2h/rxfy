import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card } from "./Card.js";
import type { CardId, ColumnId } from "./models";
import { NewCardForm } from "./NewCardForm.js";

export function Column({
  columnId,
  title,
  ids,
  onChanged,
}: {
  columnId: ColumnId;
  title: string;
  ids: CardId[];
  onChanged: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${columnId}` });
  return (
    <section className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-muted/40 p-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title} · {ids.length}
      </h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-8 flex-col gap-2">
          {ids.map((id) => (
            <Card key={id} id={id} onDeleted={onChanged} />
          ))}
        </div>
      </SortableContext>
      <NewCardForm columnId={columnId} onCreated={onChanged} />
    </section>
  );
}
