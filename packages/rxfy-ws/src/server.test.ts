import { patch, serialize, stale, subscribe } from "rxfy-protocol";
import { channelSubscription, createInMemoryHub, entitySubscription, signGrant } from "rxfy-server/hub";
import { describe, expect, it } from "vitest";
import { createWsServer, type ServerSocket } from "./server.js";

function fakeSocket() {
  const sent: string[] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket: ServerSocket = {
    send: (data) => sent.push(data),
    on: (event, listener) => void listeners.set(event, listener),
  };
  return {
    socket,
    sent,
    emit: (event: string, ...args: unknown[]) => listeners.get(event)?.(...args),
  };
}

describe("createWsServer", () => {
  it("a verified subscribe registers channel + entities and receives pushes", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub, { secret: "s" });
    const { socket, sent, emit } = fakeSocket();
    ws.handleConnection(socket);

    const grant = signGrant({ channel: "todos|{}", secret: "s", ttlMs: 60_000 });
    emit("message", serialize(subscribe(grant, ["todo:1"])));
    hub.publish(channelSubscription("todos|{}"), stale("todos|{}"));
    hub.publish(entitySubscription("todo", "1"), patch("todo", "1", { done: true }));

    expect(sent).toHaveLength(2);
  });

  it("an invalid or expired grant is dropped silently", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub, { secret: "s" });
    const { socket, sent, emit } = fakeSocket();
    ws.handleConnection(socket);

    emit("message", serialize(subscribe("garbage", ["todo:1"])));
    hub.publish(entitySubscription("todo", "1"), patch("todo", "1", {}));

    expect(sent).toHaveLength(0);
  });

  it("close drops the connection's subscriptions", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub, { secret: "s" });
    const { socket, sent, emit } = fakeSocket();
    ws.handleConnection(socket);

    const grant = signGrant({ channel: "c", secret: "s", ttlMs: 60_000 });
    emit("message", serialize(subscribe(grant, [])));
    emit("close");
    hub.publish(channelSubscription("c"), stale("c"));

    expect(sent).toHaveLength(0);
  });

  it("ignores malformed frames", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub, { secret: "s" });
    const { socket, emit } = fakeSocket();
    ws.handleConnection(socket); // register the message listener so the parse/catch path is exercised
    expect(() => emit("message", "not json")).not.toThrow();
  });
});
