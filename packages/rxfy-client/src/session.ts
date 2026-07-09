import { RXFY_SESSION_HEADER } from "rxfy-protocol";
import { readSsrSession } from "./read-session.js";

let sessionId: string | undefined;

/**
 * This page load's live session id. SSR loads adopt the server-minted id from the hydration
 * payload; client-only loads have no id until the server assigns one over the WebSocket
 * (`hello` without a session → `session` frame), so this returns `undefined` until then.
 * Minting is always the server's job — the client never invents an id.
 */
export function getSessionId(): string | undefined {
  sessionId ??= readSsrSession();
  return sessionId;
}

/** @internal Install the server-assigned id — called by the live client on a `session` frame. */
export function adoptSessionId(id: string): void {
  sessionId = id;
}

/**
 * The session header entry — spread into any HTTP client's default headers (or pass the function
 * itself where lazy headers are supported). Empty until the session is known; a headerless request
 * is served normally, just not recorded for live updates.
 */
export function sessionHeaders(): Record<string, string> {
  const id = getSessionId();
  return id === undefined ? {} : { [RXFY_SESSION_HEADER]: id };
}

/**
 * Wrap any fetch-compatible function so every request carries the session header once the session
 * is known. Defaults to the ambient `fetch`, resolved per call so late stubs and polyfills are
 * honored.
 */
export function withSession(fetchFn?: typeof fetch): typeof fetch {
  return (input, init) => {
    const id = getSessionId();
    if (id === undefined) return (fetchFn ?? globalThis.fetch)(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(RXFY_SESSION_HEADER, id);
    return (fetchFn ?? globalThis.fetch)(input, { ...init, headers });
  };
}
