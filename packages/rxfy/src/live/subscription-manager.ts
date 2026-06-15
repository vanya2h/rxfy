import type { Topic } from "./topic.js";

export type SubscriptionManager = ReturnType<typeof createSubscriptionManager>;

export function createSubscriptionManager(send: (topics: Topic[]) => void): {
  want(topic: Topic): void;
  reconnect(): void;
} {
  const desired = new Set<Topic>();
  let active = new Set<Topic>();

  const reconcile = () => {
    const gap = [...desired].filter((t) => !active.has(t));
    if (gap.length) send(gap);
    active = new Set(desired);
  };

  return {
    want(topic: Topic) {
      if (desired.has(topic)) return;
      desired.add(topic);
      reconcile();
    },
    reconnect() {
      active = new Set();
      reconcile();
    },
  };
}
