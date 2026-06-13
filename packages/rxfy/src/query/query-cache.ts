import { Atom, createAtom } from "../atom/atom.js";
import { type IWrapped, StatusEnum, createIdle } from "../wrapped/wrapped.js";

export type QueryCache = {
  /** Get-or-create the query's status Atom, seeded IDLE. Shared per key → dedup. */
  getQuery: <TValue = unknown>(key: string) => Atom<IWrapped<TValue>>;
  /** Current value without creating a cell — used by serialization and sync reads. */
  peek: <TValue = unknown>(key: string) => IWrapped<TValue> | undefined;
  delete: (key: string) => void;
  /** Terminal-state entries (FULFILLED/REJECTED) for serialization. */
  entries: () => [string, IWrapped][];
  /** In-flight promise slot — SSR Suspense throws and server-side request dedup. Never serialized. */
  getPromise: (key: string) => Promise<unknown> | undefined;
  setPromise: (key: string, promise: Promise<unknown>) => void;
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
    peek: <TValue = unknown>(key: string) => atoms.get(key)?.get() as IWrapped<TValue> | undefined,
    delete: (key) => {
      atoms.delete(key);
      promises.delete(key);
    },
    entries: () =>
      [...atoms.entries()].map(([k, a]) => [k, a.get()] as [string, IWrapped]).filter(([, w]) => isTerminal(w)),
    getPromise: (key) => promises.get(key),
    setPromise: (key, promise) => {
      promises.set(key, promise);
      const cleanup = () => {
        if (promises.get(key) === promise) promises.delete(key);
      };
      void promise.then(cleanup, cleanup);
    },
    inflight: () => [...promises.values()],
  };
}
