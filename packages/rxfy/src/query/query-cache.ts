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
  const entries = new Map<string, QueryEntry>();
  const promises = new Map<string, Promise<unknown>>();

  return {
    get: (key) => entries.get(key),
    set: (key, entry) => {
      entries.set(key, entry);
    },
    delete: (key) => {
      entries.delete(key);
      promises.delete(key);
    },
    entries: () => [...entries.entries()],
    getPromise: (key) => promises.get(key),
    setPromise: (key, promise) => {
      promises.set(key, promise);
      void promise.finally(() => {
        if (promises.get(key) === promise) promises.delete(key);
      });
    },
    inflight: () => [...promises.values()],
  };
}
