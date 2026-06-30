import type { IModelRegistry } from "rxfy";
import type { ServerMessage } from "rxfy-protocol";
import { BehaviorSubject, type Observable, type Subscription } from "rxjs";

/** topic→id / channel→id lookup table the client uses to subscribe. */
export type Grants = {
  entities: Record<string, string>;
  channels: Record<string, string>;
};

/** Structural transport (satisfied by rxfy-ws/client's ClientTransport). */
export type LiveTransport = {
  subscribe: (ids: string[]) => void;
  unsubscribe: (ids: string[]) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
};

export type ChannelCounter = {
  available$: Observable<number>;
  reset: () => void;
};

export type LiveClient = {
  channel: (channel: string) => ChannelCounter;
  addGrants: (grants: Grants) => void;
  stop: () => void;
};

export type LiveClientConfig = {
  registry: IModelRegistry;
  transport: LiveTransport;
  grants?: Grants;
};

export function createLiveClient({ registry, transport, grants }: LiveClientConfig): LiveClient {
  const entityIds: Record<string, string> = { ...(grants?.entities ?? {}) };
  const channelIds: Record<string, string> = { ...(grants?.channels ?? {}) };
  const counters = new Map<string, BehaviorSubject<number>>();
  const subscribedTopics = new Set<string>();
  const subscribedChannels = new Set<string>();

  const subscribeTopic = (topic: string): void => {
    const id = entityIds[topic];
    if (id && !subscribedTopics.has(topic)) {
      subscribedTopics.add(topic);
      transport.subscribe([id]);
    }
  };
  const subscribeChannel = (channel: string): void => {
    const id = channelIds[channel];
    if (id && !subscribedChannels.has(channel)) {
      subscribedChannels.add(channel);
      transport.subscribe([id]);
    }
  };

  transport.onMessage((message) => {
    if (message.kind === "patch") {
      registry
        .namedStores()
        .get(message.name)
        ?.set(message.id, message.data as never);
    } else {
      const counter = counters.get(message.channel);
      if (counter) counter.next(counter.value + 1);
    }
  });

  const addedSub: Subscription = registry.added$.subscribe(({ name, key }) => {
    subscribeTopic(`${name}:${key}`);
  });

  return {
    channel(channel) {
      let counter = counters.get(channel);
      if (!counter) {
        counter = new BehaviorSubject(0);
        counters.set(channel, counter);
      }
      subscribeChannel(channel);
      const subject = counter;
      return { available$: subject.asObservable(), reset: () => subject.next(0) };
    },
    addGrants(next) {
      Object.assign(entityIds, next.entities);
      Object.assign(channelIds, next.channels);
      for (const channel of counters.keys()) subscribeChannel(channel);
    },
    stop() {
      addedSub.unsubscribe();
    },
  };
}
