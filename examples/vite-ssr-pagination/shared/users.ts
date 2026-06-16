import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  initials: z.string(),
});

export type User = z.infer<typeof UserSchema>;

/** `nextCursor` is always a string here — the generated list never ends. */
export interface UsersPage {
  items: User[];
  nextCursor: string;
}
