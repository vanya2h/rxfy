const RXFY_SYNC = Symbol.for("rxfy.sync");
const RXFY_RELOAD = Symbol.for("rxfy.reload");

type Marked = { [RXFY_SYNC]?: boolean; [RXFY_RELOAD]?: () => void };

/** Marks an observable as emitting synchronously on subscribe — safe for usePending's render-time probe. */
export function markSync<T extends object>(target: T): T {
  (target as Marked)[RXFY_SYNC] = true;
  return target;
}

export function isSyncMarked(target: object): boolean {
  return (target as Marked)[RXFY_SYNC] === true;
}

/** Attaches the owning handle's reload() so Pending's onReload can invalidate the query cache. */
export function attachReload<T extends object>(target: T, reload: () => void): T {
  (target as Marked)[RXFY_RELOAD] = reload;
  return target;
}

export function getAttachedReload(target: object): (() => void) | undefined {
  return (target as Marked)[RXFY_RELOAD];
}
