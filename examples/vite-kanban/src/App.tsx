import { parseResponse } from "hono/client";
import { useEffect } from "react";
import { useObservable, useStateData } from "rxfy-react";
import { useApi } from "./kanban/api-client.js";
import { Board } from "./kanban/Board.js";
import { boardState } from "./kanban/states.js";
import { ThemeToggle } from "./kanban/ThemeToggle.js";

export function App() {
  const api = useApi();
  const board = useStateData({
    state: boardState,
    fetchFn: () => parseResponse(api.board.$get()),
    params: {},
  });

  // Drag/edit patch the board in place across tabs, but a card CREATED or DELETED in another tab
  // arrives as a `stale` bump on `updatesAvailable$` (the board's id-list changed). Auto-apply it so
  // the board stays live everywhere without a manual "refresh" click. `applyUpdates` resets the
  // counter to 0, so this settles rather than looping.
  const { updatesAvailable$, applyUpdates } = board;
  const updates = useObservable(updatesAvailable$, 0);
  useEffect(() => {
    if (updates > 0) applyUpdates();
  }, [updates, applyUpdates]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">rxfy live kanban</h1>
        <ThemeToggle />
      </header>
      <Board board={board} />
    </main>
  );
}
