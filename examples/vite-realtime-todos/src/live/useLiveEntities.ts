import { useEffect } from "react";
import type { ModelDescriptor } from "rxfy";
import { useModelStore } from "rxfy-react";

export function useLiveEntities<T>(model: ModelDescriptor<T>, socket: WebSocket | null) {
  const store = useModelStore(model);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as { name: string; entities: unknown[] };
      if (msg.name !== model.name) return;
      store.setMany(msg.entities.map((row) => model.schema.parse(row)));
    };
    socket.addEventListener("message", handler);
    return () => socket.removeEventListener("message", handler);
  }, [store, socket, model]);
}
