export type LiveClient = ReturnType<typeof createLiveClient>;

export function createLiveClient(socket: WebSocket) {
  const desired = new Set<string>(); // every topic we've ever wanted (grows, never shrinks)
  let active = new Set<string>(); // topics the server currently knows

  const send = (topics: string[]) => {
    if (topics.length && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "add", topics }));
    }
  };

  // Send only the topics the server hasn't heard yet (desired − active), then record them.
  // So a burst of want() calls collapses to a single "add" of just the new topics.
  const reconcile = () => {
    send([...desired].filter((t) => !active.has(t)));
    active = new Set(desired);
  };

  // Reconnect: the server forgot our subscriptions — replay the whole desired set.
  socket.addEventListener("open", () => {
    active = new Set();
    reconcile();
  });

  return {
    // Subscribe to everything the store loads; idempotent, never unsubscribes (the store
    // doesn't evict, so we stay live on an entity for the session).
    want(topic: string) {
      if (desired.has(topic)) return;
      desired.add(topic);
      reconcile();
    },
  };
}
