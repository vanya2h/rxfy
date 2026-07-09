import type { IModelRegistry } from "rxfy";
import type { ServerMessage } from "rxfy-protocol";
import { BehaviorSubject, type Observable } from "rxjs";

/** Structural transport (satisfied by rxfy-ws/client's ClientTransport). */
export type LiveTransport = {
  hello: (session: string) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
};

export type ChannelCounter = {
  available$: Observable<number>;
  reset: () => void;
};

export type LiveClient = {
  channel: (channel: string) => ChannelCounter;
  stop: () => void;
};

export type LiveClientConfig = {
  registry: IModelRegistry;
  transport: LiveTransport;
  /** This page load's session id — the server pushes updates for everything it serves this session. */
  session: string;
};

/**
 * A pure sink: the server tracks what this session was served and pushes updates for it. Patches
 * land in the model stores in place; stales bump the matching channel counter. The client never
 * subscribes to anything — its entire outbound protocol is the hello.
 */
export function createLiveClient({ registry, transport, session }: LiveClientConfig): LiveClient {
  const counters = new Map<string, BehaviorSubject<number>>();

  transport.onMessage((message) => {
    if (message.kind === "patch") {
      registry
        .namedStores()
        .get(message.name)
        ?.set(message.id, message.data as unknown);
    } else {
      const counter = counters.get(message.channel);
      if (counter) counter.next(counter.value + 1);
    }
  });

  transport.hello(session);

  return {
    channel(channel) {
      let counter = counters.get(channel);
      if (!counter) {
        counter = new BehaviorSubject(0);
        counters.set(channel, counter);
      }
      const subject = counter;
      return { available$: subject.asObservable(), reset: () => subject.next(0) };
    },
    stop() {
      for (const counter of counters.values()) counter.complete();
      counters.clear();
    },
  };
}
