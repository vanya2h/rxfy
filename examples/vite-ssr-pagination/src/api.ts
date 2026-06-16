import type { UsersPage } from "../shared/users.ts";

/**
 * Fetches one page of users. On the server it calls the generator module directly (no HTTP
 * roundtrip during SSR); in the browser it hits the API route. The dynamic import keeps the
 * faker generator out of the client bundle.
 */
export async function fetchUsers(cursor: string | null): Promise<UsersPage> {
  if (typeof window === "undefined") {
    const { getUsersPage } = await import("../shared/generate.ts");
    return getUsersPage(cursor);
  }
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`/api/users${qs}`);
  if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
  return (await res.json()) as UsersPage;
}
