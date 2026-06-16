import { array, createModel, defineState } from "rxfy";
import { useModelStore } from "rxfy-react";
import { z } from "zod";
import { UserSchema } from "../shared/users.ts";

export const userModel = createModel(UserSchema, { getKey: (u) => u.id, name: "user" });

export const useUserStore = () => useModelStore(userModel);

/** One unfiltered, growing list. Empty params keep the query identity stable so manual `set` accumulates. */
export const usersState = defineState({
  key: "users",
  params: z.object({}),
  model: { users: array(userModel) },
});
