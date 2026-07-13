import {
  collectShapeTopics,
  type FieldsMap,
  type IModelRegistry,
  parseShape,
  stateChannel,
  type StateDescriptor,
} from "rxfy";
import { patch, stale } from "rxfy-protocol";
import { signGrant, verifyGrant } from "./grant.js";
import { channelSubscription, entitySubscription, type Hub } from "./hub.js";
import { grantsHydration } from "./hydration.js";
import type { TouchTarget } from "./state-channel.js";
import type { LiveStorage, Resource } from "./storage.js";

export type WriteOpts = { touch?: TouchTarget[] };

export type LiveConfig<TBinding> = {
  /** Persistence backend — pairs with the resources' binding type. */
  storage: LiveStorage<TBinding>;
  hub: Hub;
  /** HMAC secret for signing/verifying channel grants (required). */
  secret: string;
  /** Grant lifetime in ms. Default 15 minutes. */
  grantTtlMs?: number;
  /** Renewal grace window in ms. Default 5 minutes. */
  renewGraceMs?: number;
};

/** The live server: storage-neutral writers plus the stateless grant half (serve/renew/hydration). */
export type Live<TBinding> = {
  /** Insert and publish a patch. Returns the persisted row. */
  create: <TInsert, TRow>(
    resource: Resource<TInsert, TRow, TBinding>,
    values: TInsert,
    opts?: WriteOpts,
  ) => Promise<TRow>;
  /** Update by id and publish a patch. Resolves `undefined` when no row matches (no patch/touch then). */
  update: <TInsert, TRow>(
    resource: Resource<TInsert, TRow, TBinding>,
    id: string,
    values: Partial<TInsert>,
    opts?: WriteOpts,
  ) => Promise<TRow | undefined>;
  delete: <TRow>(resource: Resource<unknown, TRow, TBinding>, id: string, opts?: WriteOpts) => Promise<void>;
  touch: (...targets: TouchTarget[]) => void;
  /**
   * Parses `data` (the state's *input* shape) through the field schemas, signs a grant for
   * `stateChannel(state, params)` whose claims also enumerate the payload's entity topics, and
   * returns the parsed shape with the grant attached as `$grant`. Stateless — the hub is untouched.
   */
  serve: <TParams, TShape, TShapeInput>(
    state: StateDescriptor<TParams, TShape, any, any, any, TShapeInput>,
    params: TParams,
    data: TShapeInput,
  ) => TShape & { $grant: string };
  /** Verify (with grace) and reissue one grant, preserving its channel + entities; null = denied. */
  renew: (grant: string) => string | null;
  /** SSR payload: embeds the grants the render logged (each entity-bearing) and returns the hydration script. */
  hydration: (registry: IModelRegistry) => string;
};

export function createLive<TBinding>(config: LiveConfig<TBinding>): Live<TBinding> {
  const { storage, hub, secret } = config;
  const grantTtlMs = config.grantTtlMs ?? 15 * 60_000;
  const renewGraceMs = config.renewGraceMs ?? 5 * 60_000;

  const publishEntity = (name: string, id: string, row: unknown): void => {
    hub.publish(entitySubscription(name, id), patch(name, id, row));
  };
  const applyTouch = (targets: TouchTarget[] | undefined): void => {
    for (const target of targets ?? []) hub.publish(channelSubscription(target.channel), stale(target.channel));
  };

  return {
    async create(resource, values, opts) {
      const row = await storage.create(resource.binding, values);
      publishEntity(resource.name, resource.getKey(row as never), row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async update(resource, id, values, opts) {
      const row = await storage.update(resource.binding, id, values);
      if (row === undefined) return undefined; // not found — nothing written, publish nothing
      publishEntity(resource.name, id, row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async delete(resource, id, opts) {
      await storage.delete(resource.binding, id);
      applyTouch(opts?.touch);
    },
    touch: (...targets) => applyTouch(targets),
    serve(state, params, data) {
      const parsed = parseShape<Record<string, unknown>>(state.fields, data);
      const channel = stateChannel(state, params as Record<string, unknown>);
      if (!channel) throw new Error("rxfy-server: serve requires a keyed state");
      const entities = collectShapeTopics(state.fields as FieldsMap, parsed);
      return { ...parsed, $grant: signGrant({ channel, entities, secret, ttlMs: grantTtlMs }) } as never;
    },
    renew(grant) {
      const claims = verifyGrant(grant, { secret, graceMs: renewGraceMs });
      return claims === null
        ? null
        : signGrant({ channel: claims.channel, entities: claims.entities, secret, ttlMs: grantTtlMs });
    },
    hydration(registry) {
      return grantsHydration(registry);
    },
  };
}
