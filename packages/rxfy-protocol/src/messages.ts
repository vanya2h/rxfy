export const PROTOCOL_VERSION = 2 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// @todo I'm thinking whether it is possible to add T extends generic for values like "name" and "channel" so then we could derive union type anywhere we combine them

// --- Server -> client messages ---

/** Live entity update: holders of `name:id` apply this in place. */
export type PatchMessage = {
  v: ProtocolVersion;
  kind: "patch";
  name: string;
  id: string;
  data: unknown;
};

/** Structural change signal for a state channel: clients increment a local counter. */
export type StaleMessage = {
  v: ProtocolVersion;
  kind: "stale";
  channel: string;
};

export type ServerMessage = PatchMessage | StaleMessage;

// --- Client -> server messages ---

/** Announce the session after every (re)connect. The client's ONLY outbound frame: subscriptions
 *  are written server-side by the serve path, so there is nothing else for a client to say. */
export type HelloMessage = {
  v: ProtocolVersion;
  kind: "hello";
  session: string;
};

export type ClientMessage = HelloMessage;

export type ProtocolMessage = ServerMessage | ClientMessage;

// --- Constructors ---

export const patch = (name: string, id: string, data: unknown): PatchMessage => ({
  v: PROTOCOL_VERSION,
  kind: "patch",
  name,
  id,
  data,
});

export const stale = (channel: string): StaleMessage => ({
  v: PROTOCOL_VERSION,
  kind: "stale",
  channel,
});

export const hello = (session: string): HelloMessage => ({ v: PROTOCOL_VERSION, kind: "hello", session });

/** HTTP header carrying the live session id, matched to the WebSocket `hello`. */
export const RXFY_SESSION_HEADER = "x-rxfy-session";
