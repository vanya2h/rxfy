import { createHmac } from "node:crypto";

export type TopicKeyer = {
  /** The opaque id for `topic` in the current time window. */
  current: (topic: string) => string;
  /** Ids the server should publish on: [current window, previous window] (boundary cover). */
  forPublish: (topic: string) => [string, string];
};

export type TopicKeyerConfig = {
  /** HMAC secret. Never sent to clients. */
  secret: string;
  /** Window length in milliseconds; an id self-expires when the window rolls. */
  windowMs: number;
  /** Injectable clock (defaults to Date.now); used for deterministic tests. */
  now?: () => number;
};

export function createTopicKeyer({ secret, windowMs, now = Date.now }: TopicKeyerConfig): TopicKeyer {
  const idFor = (topic: string, window: number): string =>
    createHmac("sha256", secret).update(`${topic}:${window}`).digest("base64url");

  const windowOf = (t: number): number => Math.floor(t / windowMs);

  return {
    current: (topic) => idFor(topic, windowOf(now())),
    forPublish: (topic) => {
      const w = windowOf(now());
      return [idFor(topic, w), idFor(topic, w - 1)];
    },
  };
}
