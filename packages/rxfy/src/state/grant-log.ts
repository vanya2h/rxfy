/** Per-request log of the signed grants produced during an SSR render. Fed by useStateData's SSR
 *  settle/seed paths; read by grantsHydration to embed grants in the hydration script (verbatim —
 *  each grant already names its channel + entities). Client-side it stays empty. Set-backed, so
 *  duplicate adds are idempotent. */
export type GrantLog = {
  add: (grant: string) => void;
  all: () => string[];
};

export function createGrantLog(): GrantLog {
  const grants = new Set<string>();
  return {
    add: (grant) => void grants.add(grant),
    all: () => [...grants],
  };
}
