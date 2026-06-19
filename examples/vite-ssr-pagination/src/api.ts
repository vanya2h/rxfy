import type { User, UsersPage } from "../shared/users.ts";

/**
 * Fetches one page of users. On the server it calls the generator module directly (no HTTP
 * roundtrip during SSR); in the browser it hits the API route. `import.meta.env.SSR` is a
 * compile-time constant, so Vite dead-code-eliminates the dynamic import from the client
 * build — faker never ships to the browser.
 */
export async function fetchUsers(cursor: string | null): Promise<UsersPage> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- import.meta.env.SSR is a Vite build constant, not an env var
  if (import.meta.env.SSR) {
    const { getUsersPage } = await import("../shared/generate.ts");
    return getUsersPage(cursor);
  }
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`/api/users${qs}`);
  if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
  return (await res.json()) as UsersPage;
}

export interface UsersHeader {
  topUser: User;
  meta: { total: number; generatedAt: string };
}

/**
 * Fetches the header data — a single entity (topUser) mixed with a plain value (meta).
 * Demonstrates the plain value fields feature of `defineState`. Same server-vs-client
 * split as `fetchUsers`: direct generator call on the server, HTTP on the client.
 */
export async function fetchUsersHeader(_params: Record<string, never>): Promise<UsersHeader> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- import.meta.env.SSR is a Vite build constant, not an env var
  if (import.meta.env.SSR) {
    const { getUsersPage } = await import("../shared/generate.ts");
    // total = large fixed number (one page is a sample; the list is infinite — use 1000 as the catalogue size)
    const total = 1000;
    const { items } = getUsersPage(null);
    return { topUser: items[0]!, meta: { total, generatedAt: new Date().toISOString() } };
  }
  const res = await fetch("/api/users-header");
  if (!res.ok) throw new Error(`Failed to load users header: ${res.status}`);
  return (await res.json()) as UsersHeader;
}
