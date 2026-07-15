import { array, defineState } from "rxfy";
import { z } from "zod";
import { cardModel } from "./models";

export const boardState = defineState({
  key: "board",
  params: z.object({}),
  model: { cards: array(cardModel) },
});
