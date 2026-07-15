import { createModel } from "rxfy";
import { z } from "zod";

export const COLUMNS = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" },
] as const;
export type ColumnId = (typeof COLUMNS)[number]["id"];
export const ColumnIdSchema = z.enum(["todo", "doing", "done"]);

export const CardIdSchema = z.string().brand("CardId");
export type CardId = z.infer<typeof CardIdSchema>;

// `createdAt` lives in the db table (for stable seed ordering) but is deliberately omitted from the
// model schema — the UI never shows it, and keeping the schema free of `z.coerce.*` avoids an
// input/output shape divergence that would ripple into the `useStateData` handle's types.
export const CardSchema = z.object({
  id: CardIdSchema,
  columnId: ColumnIdSchema,
  title: z.string(),
  description: z.string(),
  position: z.string(),
});
export type Card = z.infer<typeof CardSchema>;

/** Per-endpoint write payloads. */
export const CreateCardInputSchema = z.object({ columnId: ColumnIdSchema, title: z.string().min(1) });
export const UpdateCardInputSchema = z
  .object({
    columnId: ColumnIdSchema,
    title: z.string().min(1),
    description: z.string(),
    position: z.string(),
  })
  .partial();
export type CreateCardInput = z.infer<typeof CreateCardInputSchema>;
export type UpdateCardInput = z.infer<typeof UpdateCardInputSchema>;

export const cardModel = createModel({ schema: CardSchema, getKey: (c) => c.id, name: "card" });
