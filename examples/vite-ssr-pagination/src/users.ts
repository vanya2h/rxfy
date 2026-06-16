import { createModel } from "rxfy";
import { useModelStore } from "rxfy-react";
import { UserSchema } from "../shared/users.ts";

export const userModel = createModel(UserSchema, { getKey: (u) => u.id, name: "user" });

export const useUserStore = () => useModelStore(userModel);
