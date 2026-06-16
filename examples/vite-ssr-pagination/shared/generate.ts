import { faker } from "@faker-js/faker";
import type { User, UsersPage } from "./users.ts";

const PAGE_SIZE = 20;

/** Deterministic per index — the same offset always yields the same users. */
function makeUser(index: number): User {
  faker.seed(index + 1);
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  return {
    id: `u${index + 1}`,
    name: `${first} ${last}`,
    email: faker.internet.email({ firstName: first, lastName: last }).toLowerCase(),
    initials: `${first[0]}${last[0]}`,
  };
}

/**
 * Offset-based paging over an infinite, on-demand dataset. The cursor is the next offset as
 * a string ("20", "40", …); `null` means "start from the beginning". `nextCursor` is always
 * the following offset — the list never runs out.
 */
export function getUsersPage(cursor: string | null, pageSize = PAGE_SIZE): UsersPage {
  const offset = cursor ? Number(cursor) : 0;
  const items = Array.from({ length: pageSize }, (_, i) => makeUser(offset + i));
  return { items, nextCursor: String(offset + pageSize) };
}
