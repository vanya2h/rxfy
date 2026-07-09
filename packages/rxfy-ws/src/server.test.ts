import { hello, parseServerMessage, serialize, stale } from "rxfy-protocol";
import { createInMemoryHub } from "rxfy-server";
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
  it("hello binds the session; hub publishes reach the socket", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub);
    const { socket, sent, emit } = fakeSocket();
    ws.handleConnection(socket);

    hub.subscribe("s1", ["c:todos"]); // written by the serve path
    emit("message", serialize(hello("s1")));
    hub.publish("c:todos", stale("todos"));

    expect(sent).toHaveLength(1);
    expect(parseServerMessage(sent[0]!)).toEqual({ v: 2, kind: "stale", channel: "todos" });
  });

  it("close releases the session but keeps its subscriptions until ttl", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const ws = createWsServer(hub);
    const a = fakeSocket();
    ws.handleConnection(a.socket);
    hub.subscribe("s1", ["c:todos"]);
    a.emit("message", serialize(hello("s1")));
    a.emit("close");

    // reconnect within ttl: a new socket re-hellos and delivery resumes
    t = 50;
    const b = fakeSocket();
    ws.handleConnection(b.socket);
    b.emit("message", serialize(hello("s1")));
    hub.publish("c:todos", stale("todos"));
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(1);
  });

  it("a stale close from a replaced socket does not release the session", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub);
    const a = fakeSocket();
    const b = fakeSocket();
    ws.handleConnection(a.socket);
    ws.handleConnection(b.socket);
    hub.subscribe("s1", ["c:todos"]);
    a.emit("message", serialize(hello("s1")));
    b.emit("message", serialize(hello("s1"))); // reconnect replaced socket a
    a.emit("close"); // old socket closes late
    hub.publish("c:todos", stale("todos"));
    expect(b.sent).toHaveLength(1);
  });

  it("ignores malformed frames", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub);
    const { socket, emit } = fakeSocket();
    ws.handleConnection(socket); // register the message listener so the parse/catch path is exercised
    expect(() => emit("message", "not json")).not.toThrow();
  });
});
