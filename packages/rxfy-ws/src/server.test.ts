import { EventEmitter } from "node:events";
import { parseServerMessage, serialize, stale, subscribe, unsubscribe } from "rxfy-protocol";
import { createInMemoryHub } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { createWsServer } from "./server.js";

class FakeSocket extends EventEmitter {
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
}

describe("createWsServer", () => {
  it("subscribes a connection and forwards published messages to its socket", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const socket = new FakeSocket();
    server.handleConnection(socket as never);
    socket.emit("message", serialize(subscribe(["id-1"])));
    const msg = stale("post:orgId=A");
    hub.publish("id-1", msg);
    expect(socket.sent.map((s) => parseServerMessage(s))).toEqual([msg]);
  });

  it("stops forwarding after an unsubscribe frame", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const socket = new FakeSocket();
    server.handleConnection(socket as never);
    socket.emit("message", serialize(subscribe(["id-1"])));
    socket.emit("message", serialize(unsubscribe(["id-1"])));
    hub.publish("id-1", stale("c"));
    expect(socket.sent).toEqual([]);
  });

  it("drops the connection on close", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const socket = new FakeSocket();
    server.handleConnection(socket as never);
    socket.emit("message", serialize(subscribe(["id-1"])));
    socket.emit("close");
    hub.publish("id-1", stale("c"));
    expect(socket.sent).toEqual([]);
  });

  it("ignores malformed inbound frames without throwing", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const socket = new FakeSocket();
    server.handleConnection(socket as never);
    expect(() => socket.emit("message", "{not a frame")).not.toThrow();
  });

  it("routes to the correct socket among several connections", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const a = new FakeSocket();
    const b = new FakeSocket();
    server.handleConnection(a as never);
    server.handleConnection(b as never);
    a.emit("message", serialize(subscribe(["id-a"])));
    b.emit("message", serialize(subscribe(["id-b"])));
    const msg = stale("c");
    hub.publish("id-a", msg);
    expect(a.sent.map((s) => parseServerMessage(s))).toEqual([msg]);
    expect(b.sent).toEqual([]);
  });
});
