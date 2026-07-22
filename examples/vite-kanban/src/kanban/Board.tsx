import { closestCorners, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { generateKeyBetween } from "fractional-indexing";
import { parseResponse } from "hono/client";
import type { StateDescriptor } from "rxfy";
import { Pending, type StateHandle, useModelStore } from "rxfy-react";
import { useApi } from "./api-client.js";
import { Column } from "./Column.js";
import { type CardId, cardModel, type ColumnId, COLUMNS } from "./models";
import type { boardState } from "./states";

/** The `useStateData` handle for a given state descriptor — derived so `data$`/`applyUpdates` stay precise. */
type StateHandleFor<S> =
  S extends StateDescriptor<infer _TParams, infer TShape, infer TMutations, infer TQuery, infer TWritable>
    ? StateHandle<TShape, TMutations, TQuery, TWritable>
    : never;
type BoardHandle = StateHandleFor<typeof boardState>;
type Groups = { todo: CardId[]; doing: CardId[]; done: CardId[] };

const COLUMN_IDS = COLUMNS.map((c) => c.id);

/** Which column an over-target belongs to — a `col:<id>` droppable, or a card id inside a column. */
function columnOf(overId: string, groups: Groups): ColumnId {
  if (overId.startsWith("col:")) return overId.slice(4) as ColumnId;
  for (const col of COLUMN_IDS) if (groups[col].includes(overId as CardId)) return col;
  return "todo";
}

export function Board({ board }: { board: BoardHandle }) {
  // <Pending> renders the fulfilled query synchronously during SSR, and — because a `stale` refetch
  // reloads in place (data$ keeps its identity and never emits the interim PENDING) — it holds the
  // last board across reloads. So a create/move/delete never flashes "Loading"; it just updates.
  return (
    <Pending
      value$={board.data$}
      pending={<p className="text-muted-foreground">Loading board…</p>}
      rejected={() => <p className="text-destructive">Failed to load.</p>}
    >
      {(groups) => <BoardColumns groups={groups} board={board} />}
    </Pending>
  );
}

function BoardColumns({ groups, board }: { groups: Groups; board: BoardHandle }) {
  const api = useApi();
  const store = useModelStore(cardModel);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id) as CardId;
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    const active = store.getValue(activeId);
    if (!active) return;

    const columnId = columnOf(overId, groups);
    const destIds = groups[columnId].filter((cid) => cid !== activeId);
    const index = overId.startsWith("col:") ? destIds.length : Math.max(0, destIds.indexOf(overId as CardId));
    const before = index > 0 ? (store.getValue(destIds[index - 1]!)?.position ?? null) : null;
    const after = index < destIds.length ? (store.getValue(destIds[index]!)?.position ?? null) : null;
    const position = generateKeyBetween(before, after);

    // Optimistic: reorder the query id arrays in place (setRaw keeps the query FULFILLED — no flash)
    // and freshen the entity. The server persists, then echoes a `stale`; the refetch reconciles.
    store.set(activeId, { ...active, columnId, position });
    board.setRaw((prev) => {
      const next: Groups = { todo: [...prev.todo], doing: [...prev.doing], done: [...prev.done] };
      for (const col of COLUMN_IDS) next[col] = next[col].filter((cid) => cid !== activeId);
      next[columnId].splice(index, 0, activeId);
      return next;
    });
    void parseResponse(api.cards[":id"].$patch({ param: { id: activeId }, json: { columnId, position } }));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            columnId={col.id}
            title={col.title}
            ids={groups[col.id]}
            onChanged={board.applyUpdates}
          />
        ))}
      </div>
    </DndContext>
  );
}
