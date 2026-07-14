export const PROTOCOL_VERSION = 2 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// @todo I'm thinking whether it is possible to add T extends generic for values like "name" and "channel" so then we could derive union type anywhere we combine them

// --- Server -> client messages ---

/** Sync entity update: holders of `name:id` apply this in place. */
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

/** The client's ONLY outbound frame: present a signed channel grant. The grant's claims name the
 *  channel AND the exact entity topics (`name:id`) the served payload normalized into — the server
 *  subscribes to those and nothing the client asks for out of band. */
export type SubscribeMessage = {
  v: ProtocolVersion;
  kind: "subscribe";
  grant: string;
};

export type ClientMessage = SubscribeMessage;

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

export const subscribe = (grant: string): SubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "subscribe",
  grant,
});
