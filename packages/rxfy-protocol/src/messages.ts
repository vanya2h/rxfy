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

/** The client's ONLY outbound frame: present a signed channel grant and the raw entity topics
 *  (`name:id`) its payload normalized into. Channel access is authorized by the grant; entity
 *  topics are accepted alongside any currently-valid grant (ids are required to be unguessable). */
export type SubscribeMessage = {
  v: ProtocolVersion;
  kind: "subscribe";
  grant: string;
  entities: string[];
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

export const subscribe = (grant: string, entities: string[]): SubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "subscribe",
  grant,
  entities,
});
