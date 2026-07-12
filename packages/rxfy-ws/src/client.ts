import { type ClientMessage, parseServerMessage, serialize, type ServerMessage } from "rxfy-protocol";

/** The subset of the WHATWG WebSocket API the client uses (browser `WebSocket` and `ws` both satisfy it). */
export type WebSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

export type ClientTransport = {
  /** Send a client frame; silently dropped when the socket isn't open — the live client replays
   *  its full grant set on every `onOpen`, which is the durability mechanism. */
  send: (message: ClientMessage) => void;
  /** Register the inbound-message handler. Single slot — a later call replaces the previous handler. */
  onMessage: (handler: (message: ServerMessage) => void) => void;
  /** Fires on every (re)connect once the socket is open. Single slot. */
  onOpen: (handler: () => void) => void;
  close: () => void;
};

export type WsClientOptions = {
  url: string;
  /** Defaults to the global `WebSocket`. Inject for Node/tests. */
  WebSocketImpl?: WebSocketFactory;
  reconnectDelayMs?: number;
};

const OPEN = 1;

export function createWsClient(options: WsClientOptions): ClientTransport {
  const { url, reconnectDelayMs = 1000 } = options;
  const create: WebSocketFactory =
    options.WebSocketImpl ??
    ((u) => new (globalThis as unknown as { WebSocket: new (u: string) => WebSocketLike }).WebSocket(u));

  let messageHandler: ((message: ServerMessage) => void) | undefined;
  let openHandler: (() => void) | undefined;
  let socket: WebSocketLike | undefined;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    socket = create(url);
    socket.addEventListener("open", () => {
      openHandler?.();
    });
    socket.addEventListener("message", (event: unknown) => {
      const ev = event as { data: unknown };
      const text = typeof ev.data === "string" ? ev.data : (ev.data as { toString(): string }).toString();
      let message: ServerMessage;
      try {
        message = parseServerMessage(text);
      } catch {
        return;
      }
      messageHandler?.(message);
    });
    socket.addEventListener("close", () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
    });
  };

  connect();

  return {
    send(message) {
      if (socket && socket.readyState === OPEN) socket.send(serialize(message));
    },
    onMessage(next) {
      messageHandler = next;
    },
    onOpen(next) {
      openHandler = next;
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
