import type { UsersPage } from "../shared/users.ts";

/**
 * Fetches one page of users. On the server it calls the generator module directly (no HTTP
 * roundtrip during SSR); in the browser it hits the API route. `import.meta.env.SSR` is a
 * compile-time constant, so Vite dead-code-eliminates the dynamic import from the client
 * build — faker never ships to the browser.
 */
export async function fetchUsers(cursor: string | null): Promise<UsersPage> {
  if (import.meta.env.SSR) {
    const { getUsersPage } = await import("../shared/generate.ts");
    return getUsersPage(cursor);
  }
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`/api/users${qs}`);
  if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
  return (await res.json()) as UsersPage;
}
