import { patch, type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { type ConnId, createInMemoryHub } from "./hub.js";

const msg = (): ServerMessage => patch("post", "1", { id: "1" });

function collector() {
  const received: Array<{ conn: ConnId; message: ServerMessage }> = [];
  return { received, sink: (conn: ConnId, message: ServerMessage) => received.push({ conn, message }) };
}

describe("createInMemoryHub", () => {
  it("delivers a published message to subscribers of that id", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1"]);
    hub.subscribe("b", ["id-1"]);
    const m = msg();
    hub.publish("id-1", m);
    expect(received).toEqual([
      { conn: "a", message: m },
      { conn: "b", message: m },
    ]);
  });

  it("does not deliver to non-subscribers", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1"]);
    hub.publish("id-2", msg());
    expect(received).toEqual([]);
  });

  it("is a no-op to publish an id with no subscribers", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    expect(() => hub.publish("nobody", msg())).not.toThrow();
    expect(received).toEqual([]);
  });

  it("stops delivering after unsubscribe", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1"]);
    hub.unsubscribe("a", ["id-1"]);
    hub.publish("id-1", msg());
    expect(received).toEqual([]);
  });

  it("drop removes a connection from all its subscriptions", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1", "id-2"]);
    hub.drop("a");
    hub.publish("id-1", msg());
    hub.publish("id-2", msg());
    expect(received).toEqual([]);
  });

  it("does nothing if no sink is registered", () => {
    const hub = createInMemoryHub();
    hub.subscribe("a", ["id-1"]);
    expect(() => hub.publish("id-1", msg())).not.toThrow();
  });
});
