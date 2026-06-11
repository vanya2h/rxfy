const RXFY_SYNC = Symbol.for("rxfy.sync");
const RXFY_RELOAD = Symbol.for("rxfy.reload");

type Marked = { [RXFY_SYNC]?: boolean; [RXFY_RELOAD]?: () => void };

/**
 * Marks an observable as emitting synchronously on subscribe — safe for usePending's render-time probe.
 * Mutates the target via a symbol property; the target must be an extensible object (rxfy-created
 * observables always are). Intended for rxfy-internal call sites, not arbitrary user observables.
 */
export function markSync<T extends object>(target: T): T {
  (target as Marked)[RXFY_SYNC] = true;
  return target;
}

/** True if the observable was flagged by markSync as emitting synchronously on subscribe. */
export function isSyncMarked(target: object): boolean {
  return (target as Marked)[RXFY_SYNC] === true;
}

/** Attaches the owning handle's reload() so Pending's onReload can invalidate the query cache. */
export function attachReload<T extends object>(target: T, reload: () => void): T {
  (target as Marked)[RXFY_RELOAD] = reload;
  return target;
}

/** Returns the reload callback set by attachReload, if any. */
export function getAttachedReload(target: object): (() => void) | undefined {
  return (target as Marked)[RXFY_RELOAD];
}
