export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

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

export type SubscribeMessage = {
  v: ProtocolVersion;
  kind: "subscribe";
  ids: string[];
};

export type UnsubscribeMessage = {
  v: ProtocolVersion;
  kind: "unsubscribe";
  ids: string[];
};

export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

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

export const subscribe = (ids: string[]): SubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "subscribe",
  ids,
});

export const unsubscribe = (ids: string[]): UnsubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "unsubscribe",
  ids,
});
