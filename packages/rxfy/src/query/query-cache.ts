import type { SerializedError } from "../ssr/serialize.js";

export type QueryEntry =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; error: SerializedError };

export type QueryCache = {
  get: (key: string) => QueryEntry | undefined;
  set: (key: string, entry: QueryEntry) => void;
  delete: (key: string) => void;
  entries: () => [string, QueryEntry][];
  /** In-flight promise slot — used for Suspense throws and request deduplication. Never serialized. */
  getPromise: (key: string) => Promise<unknown> | undefined;
  setPromise: (key: string, promise: Promise<unknown>) => void;
  inflight: () => Promise<unknown>[];
};

export function createQueryCache(): QueryCache {
  const store = new Map<string, QueryEntry>();
  const promises = new Map<string, Promise<unknown>>();

  return {
    get: (key) => store.get(key),
    set: (key, entry) => {
      store.set(key, entry);
    },
    delete: (key) => {
      store.delete(key);
      promises.delete(key);
    },
    entries: () => [...store.entries()],
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
