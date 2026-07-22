import { createResourceRegistry } from "rxfy-server";
import { defineResource } from "rxfy-server-drizzle";
import { cards } from "../db/schema.js";
import { cardModel } from "./models.js";

export const cardResource = defineResource({ table: cards, model: cardModel });

export { cardModel };

export const resources = createResourceRegistry([cardResource]);
