import { patch, stale, subscribe } from "rxfy-protocol";
import { channelSubscription, createInMemoryHub, entitySubscription, signGrant } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { createWsClient, type WebSocketLike } from "./client.js";
import { createWsServer, type ServerSocket } from "./server.js";

/** An in-process socket pair: the client's WebSocketLike wired directly to a ServerSocket. */
function socketPair(server: ReturnType<typeof createWsServer>) {
  const serverListeners = new Map<string, (...args: unknown[]) => void>();
  const clientListeners = new Map<string, Array<(event: unknown) => void>>();
  const serverSocket: ServerSocket = {
    send: (data) => {
      for (const l of clientListeners.get("message") ?? []) l({ data });
    },
    on: (event, listener) => void serverListeners.set(event, listener),
  };
  const clientSocket: WebSocketLike = {
    readyState: 1,
    send: (data: string) => serverListeners.get("message")?.(data),
    close: () => serverListeners.get("close")?.(),
    addEventListener: (type, listener) => {
      const list = clientListeners.get(type) ?? [];
      list.push(listener);
      clientListeners.set(type, list);
      if (type === "open") listener({}); // already open
    },
  };
  server.handleConnection(serverSocket);
  return clientSocket;
}

describe("ws client/server integration", () => {
  it("a verified subscribe flows patches and stales to the client", () => {
    const secret = "s";
    const hub = createInMemoryHub();
    const server = createWsServer(hub, { secret });
    const transport = createWsClient({ url: "ws://x", WebSocketImpl: () => socketPair(server) });

    const seen: unknown[] = [];
    transport.onMessage((m) => seen.push(m));

    // The client presents a signed grant whose claims name the channel AND its entity topics; the
    // server verifies and subscribes the connection under both the channel and the entity ids.
    const grant = signGrant({ channel: "todos|{}", entities: ["todo:1"], secret, ttlMs: 60_000 });
    transport.send(subscribe(grant));

    hub.publish(entitySubscription("todo", "1"), patch("todo", "1", { id: "1", done: true }));
    hub.publish(channelSubscription("todos|{}"), stale("todos|{}"));

    expect(seen).toEqual([patch("todo", "1", { id: "1", done: true }), stale("todos|{}")]);
    transport.close();
  });
});
