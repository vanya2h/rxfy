import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card } from "./Card.js";
import type { Card as CardEntity, ColumnId } from "./models";
import { NewCardForm } from "./NewCardForm.js";

export function Column({
  columnId,
  title,
  cards,
  onChanged,
}: {
  columnId: ColumnId;
  title: string;
  cards: CardEntity[];
  onChanged: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${columnId}` });
  return (
    <section className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-muted/40 p-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title} · {cards.length}
      </h2>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-8 flex-col gap-2">
          {cards.map((card) => (
            <Card key={card.id} card={card} onDeleted={onChanged} />
          ))}
        </div>
      </SortableContext>
      <NewCardForm columnId={columnId} onCreated={onChanged} />
    </section>
  );
}
