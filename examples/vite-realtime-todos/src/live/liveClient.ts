export type LiveClient = ReturnType<typeof createLiveClient>;

export function createLiveClient(socket: WebSocket) {
  const slices = new Map<string, Set<string>>(); // sliceKey -> topics
  let active = new Set<string>(); // topics the server currently knows

  const desired = () => new Set([...slices.values()].flatMap((s) => [...s]));

  const send = (type: "add" | "remove", topics: string[]) => {
    if (topics.length && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, topics }));
    }
  };

  const reconcile = () => {
    const next = desired();
    send(
      "add",
      [...next].filter((t) => !active.has(t)),
    );
    send(
      "remove",
      [...active].filter((t) => !next.has(t)),
    );
    active = next;
  };

  // Reconnect: the server forgot our subscriptions — replay them.
  socket.addEventListener("open", () => {
    active = new Set();
    reconcile();
  });

  return {
    setSlice(key: string, topics: string[]) {
      slices.set(key, new Set(topics));
      reconcile();
    },
    clearSlice(key: string) {
      slices.delete(key);
      reconcile();
    },
  };
}
