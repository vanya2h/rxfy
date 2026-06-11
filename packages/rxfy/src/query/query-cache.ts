import type { SerializedError } from "../ssr/serialize.js";

export type QueryEntry<TValue = unknown> =
  | { status: "fulfilled"; value: TValue }
  | { status: "rejected"; error: SerializedError };

export type QueryCache = {
  /**
   * The cache stores entries for many states with different shapes, so per-key typing cannot be
   * verified — the type parameter is the caller's assertion, valid at sites that know the state descriptor.
   */
  get: <TValue = unknown>(key: string) => QueryEntry<TValue> | undefined;
  set: <TValue>(key: string, entry: QueryEntry<TValue>) => void;
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
    get: <TValue = unknown>(key: string) => store.get(key) as QueryEntry<TValue> | undefined,
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
