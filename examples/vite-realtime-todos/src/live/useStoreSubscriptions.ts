import { useEffect } from "react";
import { useModelRegistry } from "rxfy-react";
import { useLiveClient } from "./LiveProvider.tsx";

// Drive subscriptions straight off the store: `registry.added$` emits { name, key } the first
// time any named entity lands in the store (initial fetch, hydration, or a push) and replays
// what's already there, so one subscription keeps the connection live on exactly the store's
// contents. No component passes ids anywhere.
export function useStoreSubscriptions() {
  const registry = useModelRegistry();
  const client = useLiveClient();

  useEffect(() => {
    if (!client) return; // SSR / no socket — nothing to subscribe over
    const sub = registry.added$.subscribe(({ name, key }) => client.want(`${name}:${key}`));
    return () => sub.unsubscribe();
  }, [registry, client]);
}
