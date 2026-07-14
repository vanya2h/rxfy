import { createModel, defineState, single } from "rxfy";
import { z } from "zod";
import { UserSchema } from "../shared/users.ts";

export const userModel = createModel({ schema: UserSchema, getKey: (u) => u.id, name: "user" });

/**
 * Header state — mixes a single normalized entity (topUser → id in query shape)
 * with a plain zod field (meta → passed through as a real object).
 */
export const usersHeaderState = defineState({
  key: "users-header",
  params: z.object({}),
  model: {
    topUser: single(userModel),
    meta: z.object({ total: z.number(), generatedAt: z.string() }),
  },
});
