/** Per-request log of the state channels materialized during a render or serve call. Fed by
 *  useStateData (SSR) and rxfy-server's serve(); read when signing the render's channel grants.
 *  Client-side it stays empty. Set-backed, so duplicate adds are idempotent. */
export type ChannelLog = {
  add: (channel: string) => void;
  all: () => string[];
};

export function createChannelLog(): ChannelLog {
  const channels = new Set<string>();
  return {
    add: (channel) => void channels.add(channel),
    all: () => [...channels],
  };
}
