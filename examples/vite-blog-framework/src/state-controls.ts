import type { StateControls } from "examples-shared";

/**
 * Registry of the currently-mounted states' imperative controls, keyed by state key. A shared
 * `PostList`/`PostDetail` reports its controls via `onReady`; the mutation helpers call
 * `refreshState` after a local write so the client that *initiated* the change refetches
 * immediately (and its live "N updates available" badge resets) instead of waiting for a manual
 * refresh. Other clients still see the badge.
 */
const controls: Record<string, StateControls | undefined> = {};

export function setStateControls(key: string, next: StateControls): void {
  controls[key] = next;
}

export function refreshState(key: string): void {
  controls[key]?.applyUpdates();
}
