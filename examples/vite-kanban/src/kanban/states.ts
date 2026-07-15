import { array, defineState } from "rxfy";
import { z } from "zod";
import { cardModel } from "./models";

// The board's *structure* — which cards are in which column, in what order — lives in the query as
// three id arrays (the server sorts each by position). Entities are read per-card from the store.
// A move/reorder is therefore a query change (→ stale/refetch); a field edit is an in-place patch.
export const boardState = defineState({
  key: "board",
  params: z.object({}),
  model: { todo: array(cardModel), doing: array(cardModel), done: array(cardModel) },
});
