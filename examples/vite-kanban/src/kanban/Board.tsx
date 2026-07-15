import { closestCorners, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { generateKeyBetween } from "fractional-indexing";
import { parseResponse } from "hono/client";
import type { StateDescriptor } from "rxfy";
import { Pending, type StateHandle, useModelStore } from "rxfy-react";
import { useApi } from "./api-client.js";
import { Column } from "./Column.js";
import { type Card as CardEntity, type CardId, cardModel, type ColumnId, COLUMNS } from "./models";
import type { boardState } from "./states";
import { useCards } from "./useCards.js";

/** The `useStateData` handle for a given state descriptor — derived so `data$`/`applyUpdates` stay precise. */
type StateHandleFor<S> =
  S extends StateDescriptor<infer _TParams, infer TShape, infer TMutations, infer TQuery, infer TWritable>
    ? StateHandle<TShape, TMutations, TQuery, TWritable>
    : never;
type BoardHandle = StateHandleFor<typeof boardState>;

/** Group + sort a flat card list into the fixed columns, ordered by fractional position. */
function byColumn(cards: CardEntity[]): Record<ColumnId, CardEntity[]> {
  const out = { todo: [], doing: [], done: [] } as Record<ColumnId, CardEntity[]>;
  for (const c of cards) out[c.columnId]?.push(c);
  for (const id of Object.keys(out) as ColumnId[]) out[id].sort((a, b) => (a.position < b.position ? -1 : 1));
  return out;
}

/** Resolve the drop target (column + insertion index) from dnd-kit's `over` id. */
function resolveDrop(overId: string, grouped: Record<ColumnId, CardEntity[]>): { columnId: ColumnId; index: number } {
  if (overId.startsWith("col:")) {
    const columnId = overId.slice(4) as ColumnId;
    return { columnId, index: grouped[columnId].length };
  }
  for (const columnId of Object.keys(grouped) as ColumnId[]) {
    const idx = grouped[columnId].findIndex((c) => c.id === overId);
    if (idx !== -1) return { columnId, index: idx };
  }
  return { columnId: "todo", index: 0 };
}

export function Board({ board }: { board: BoardHandle }) {
  const api = useApi();
  const store = useModelStore(cardModel);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;

    const active = store.getValue(activeId);
    if (!active) return;

    // Fresh grouping from the store (authoritative current positions).
    const grouped = byColumn(store.valueEntries().map(([, c]) => c));
    const { columnId, index } = resolveDrop(overId, grouped);

    // Neighbors at the drop index in the destination column, excluding the dragged card itself.
    const dest = grouped[columnId].filter((c) => c.id !== activeId);
    const before = dest[index - 1]?.position ?? null;
    const after = dest[index]?.position ?? null;
    if (active.columnId === columnId && active.position === (dest[index]?.position ?? null)) return;
    const position = generateKeyBetween(before, after);

    // Optimistic in-place move; the server echoes an idempotent patch.
    store.set(activeId, { ...active, columnId, position });
    void parseResponse(api.cards[":id"].$patch({ param: { id: activeId }, json: { columnId, position } }));
  };

  return (
    <Pending
      value$={board.data$}
      pending={<p className="text-muted-foreground">Loading board…</p>}
      rejected={() => <p className="text-destructive">Failed to load.</p>}
    >
      {({ cards }) => (
        <BoardColumns ids={cards} onDragEnd={onDragEnd} sensors={sensors} onChanged={board.applyUpdates} />
      )}
    </Pending>
  );
}

function BoardColumns({
  ids,
  onDragEnd,
  sensors,
  onChanged,
}: {
  ids: CardId[];
  onDragEnd: (e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  onChanged: () => void;
}) {
  const cards = useCards(ids);
  const grouped = byColumn(cards);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Column key={col.id} columnId={col.id} title={col.title} cards={grouped[col.id]} onChanged={onChanged} />
        ))}
      </div>
    </DndContext>
  );
}
