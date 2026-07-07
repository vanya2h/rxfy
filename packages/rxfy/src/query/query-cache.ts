import { Atom, createAtom } from "../atom/atom.js";
import { createIdle, type IWrapped, StatusEnum } from "../wrapped/wrapped.js";

export type QueryCache = {
  /** Get-or-create the query's status Atom, seeded IDLE. Shared per key → dedup. Note: TValue is an unchecked assertion — the cache stores Atom<IWrapped<unknown>> internally. */
  getQuery: <TValue = unknown>(key: string) => Atom<IWrapped<TValue>>;
  /** Terminal-state entries (FULFILLED/REJECTED) for serialization. */
  entries: () => [string, IWrapped<unknown>][];
  /**
   * Get-or-start the in-flight promise for a key — SSR Suspense throws the result and server-side
   * requests dedup on it. On a cache miss, `start` is called and its promise is stored (auto-cleared
   * when it settles); on a hit, the existing promise is returned and `start` is never called. Owning
   * the check-and-store here means a caller can't create an in-flight fetch without registering it.
   * Never serialized.
   */
  getOrStart: (key: string, start: () => Promise<unknown>) => Promise<unknown>;
  inflight: () => Promise<unknown>[];
};

export function createQueryCache(): QueryCache {
  const atoms = new Map<string, Atom<IWrapped<unknown>>>();
  const promises = new Map<string, Promise<unknown>>();

  const getQuery = <TValue = unknown>(key: string): Atom<IWrapped<TValue>> => {
    let atom = atoms.get(key);
    if (!atom) {
      atom = createAtom<IWrapped<unknown>>(createIdle());
      atoms.set(key, atom);
    }
    return atom as Atom<IWrapped<TValue>>;
  };

  const isTerminal = (w: IWrapped<unknown>) => w.type === StatusEnum.FULFILLED || w.type === StatusEnum.REJECTED;

  return {
    getQuery,
    entries: () =>
      [...atoms.entries()]
        .map(([k, a]) => [k, a.get()] as [string, IWrapped<unknown>])
        .filter(([, w]) => isTerminal(w)),
    getOrStart: (key, start) => {
      const existing = promises.get(key);
      if (existing) return existing;
      const promise = start();
      promises.set(key, promise);
      const cleanup = () => {
        if (promises.get(key) === promise) promises.delete(key);
      };
      void promise.then(cleanup, cleanup);
      return promise;
    },
    inflight: () => [...promises.values()],
  };
}
