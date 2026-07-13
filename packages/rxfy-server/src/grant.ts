import { createHmac, timingSafeEqual } from "node:crypto";

/** Decoded claims of a channel grant. `exp` is epoch milliseconds (not JWT seconds — internal format). */
export type GrantClaims = { channel: string; entities: string[]; exp: number };

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

const hmac = (input: string, secret: string): string => createHmac("sha256", secret).update(input).digest("base64url");

export function signGrant(opts: {
  channel: string;
  entities: string[];
  secret: string;
  ttlMs: number;
  now?: () => number;
}): string {
  const now = opts.now ?? Date.now;
  const payload = Buffer.from(
    JSON.stringify({ ch: opts.channel, ents: opts.entities, exp: now() + opts.ttlMs }),
  ).toString("base64url");
  return `${HEADER}.${payload}.${hmac(`${HEADER}.${payload}`, opts.secret)}`;
}

/** Signature + expiry check. `graceMs` accepts recently-expired tokens (renewal only). Null on any failure. */
export function verifyGrant(
  token: string,
  opts: { secret: string; now?: () => number; graceMs?: number },
): GrantClaims | null {
  const now = opts.now ?? Date.now;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = hmac(`${header}.${payload}`, opts.secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  const { ch, ents, exp } = (claims ?? {}) as { ch?: unknown; ents?: unknown; exp?: unknown };
  if (typeof ch !== "string" || typeof exp !== "number") return null;
  if (!Array.isArray(ents) || ents.some((e) => typeof e !== "string")) return null;
  if (exp + (opts.graceMs ?? 0) < now()) return null;
  return { channel: ch, entities: ents as string[], exp };
}
