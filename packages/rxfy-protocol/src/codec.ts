import superjson from "superjson";
import { type ClientMessage, PROTOCOL_VERSION, type ProtocolMessage, type ServerMessage } from "./messages.js";

/** Thrown when a payload is not a valid protocol message. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function serialize(message: ProtocolMessage): string {
  return superjson.stringify(message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Bound untrusted values before putting them in error messages (avoid log flooding). */
const clip = (value: unknown): string => String(value).slice(0, 64);

/** Parse JSON, require an object, and enforce the protocol version. */
function decode(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = superjson.parse(raw);
  } catch {
    throw new ProtocolError("invalid payload");
  }
  if (!isRecord(parsed)) {
    throw new ProtocolError("message must be an object");
  }
  if (parsed.v !== PROTOCOL_VERSION) {
    throw new ProtocolError(`unsupported protocol version: ${clip(parsed.v)}`);
  }
  return parsed;
}

// @todo here we can use zod models and its parsing function

export function parseServerMessage(raw: string): ServerMessage {
  const msg = decode(raw);
  switch (msg.kind) {
    case "patch":
      if (typeof msg.name !== "string" || typeof msg.id !== "string") {
        throw new ProtocolError("patch requires string `name` and `id`");
      }
      // `data` is opaque at the protocol layer; consumers validate it against their model schema.
      return { v: PROTOCOL_VERSION, kind: "patch", name: msg.name, id: msg.id, data: msg.data };
    case "stale":
      if (typeof msg.channel !== "string") {
        throw new ProtocolError("stale requires a string `channel`");
      }
      return { v: PROTOCOL_VERSION, kind: "stale", channel: msg.channel };
    case "session":
      if (typeof msg.session !== "string") {
        throw new ProtocolError("session requires a string `session`");
      }
      return { v: PROTOCOL_VERSION, kind: "session", session: msg.session };
    default:
      throw new ProtocolError(`unknown server message kind: ${clip(msg.kind)}`);
  }
}

export function parseClientMessage(raw: string): ClientMessage {
  const msg = decode(raw);
  switch (msg.kind) {
    case "hello":
      if (msg.session === undefined) {
        return { v: PROTOCOL_VERSION, kind: "hello" };
      }
      if (typeof msg.session !== "string") {
        throw new ProtocolError("hello `session`, when present, must be a string");
      }
      return { v: PROTOCOL_VERSION, kind: "hello", session: msg.session };
    default:
      throw new ProtocolError(`unknown client message kind: ${clip(msg.kind)}`);
  }
}
