import type { LiveClient } from "rxfy-react";

let client: LiveClient | undefined;

export const setLiveClient = (c: LiveClient): void => {
  client = c;
};

export const getLiveClient = (): LiveClient | undefined => client;
