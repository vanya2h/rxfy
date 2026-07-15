import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { CreateCardInputSchema, UpdateCardInputSchema } from "../src/kanban/models.js";
import { cardResource } from "../src/kanban/resources.js";
import { boardState } from "../src/kanban/states.js";
import { cards, db } from "./db.js";
import { sync } from "./sync.js";

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/board", async (c) => {
    const allCards = await db.select().from(cards).orderBy(asc(cards.position));
    // serve() parses raw rows through the state schema and attaches a signed channel grant as
    // `$grant`; the client lifts it and subscribes on its own WebSocket.
    return c.json(sync.serve(boardState, {}, { cards: allCards }));
  })
  .post("/live/renew", async (c) => {
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => sync.renew(g)) });
  })
  .post("/cards", zValidator("json", CreateCardInputSchema), async (c) => {
    const { columnId, title } = c.req.valid("json");
    // Append: new position just after the current last card in the target column.
    const columnCards = await db
      .select({ position: cards.position })
      .from(cards)
      .where(eq(cards.columnId, columnId))
      .orderBy(asc(cards.position));
    const lastPos = columnCards.at(-1)?.position ?? null;
    const position = generateKeyBetween(lastPos, null);
    const row = await sync.create(
      cardResource,
      { id: newId(), columnId, title, description: "", position },
      { touch: [touch(boardState, {})] },
    );
    return c.json(row);
  })
  .patch("/cards/:id", zValidator("json", UpdateCardInputSchema), async (c) => {
    const patch = c.req.valid("json");
    // No touch: a move/edit only changes entity fields, so the board id-list is unchanged → pure patch.
    const row = await sync.update(cardResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/cards/:id", async (c) => {
    await sync.delete(cardResource, c.req.param("id"), { touch: [touch(boardState, {})] });
    return c.json({ ok: true });
  });

export type AppType = typeof api;
