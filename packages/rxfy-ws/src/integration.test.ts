import type { AddressInfo } from "node:net";
import { patch, type ServerMessage } from "rxfy-protocol";
import { createInMemoryHub } from "rxfy-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createWsClient } from "./client.js";
import { createWsServer } from "./server.js";

describe("rxfy-ws end-to-end over a real socket", () => {
  let wss: WebSocketServer;
  let url: string;
  let hub: ReturnType<typeof createInMemoryHub>;

  beforeAll(async () => {
    hub = createInMemoryHub();
    const server = createWsServer(hub);
    wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (socket) => server.handleConnection(socket));
    await new Promise<void>((resolve) => wss.on("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;
    url = `ws://localhost:${port}`;
  });

  afterAll(() => {
    wss.close();
  });

  it("delivers a published patch to a subscribed client", async () => {
    const transport = createWsClient({
      url,
      WebSocketImpl: (u) => new WebSocket(u) as never,
      reconnectDelayMs: 50,
    });

    const message = patch("post", "1", { id: "1", title: "hello" });
    const received = new Promise<ServerMessage>((resolve) => transport.onMessage(resolve));

    transport.subscribe(["topic-id-1"]);

    // publish repeatedly until the subscription has propagated through the socket
    const ticker = setInterval(() => hub.publish("topic-id-1", message), 25);
    const got = await received;
    clearInterval(ticker);
    transport.close();

    expect(got).toEqual(message);
  }, 5000);
});
