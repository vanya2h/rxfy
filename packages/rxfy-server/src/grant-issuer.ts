import {
  collectShapeTopics,
  type FieldsMap,
  type IModelRegistry,
  parseShape,
  stateChannel,
  type StateDescriptor,
} from "rxfy";
import { signGrant, verifyGrant } from "./grant.js";
import { grantsHydration } from "./hydration.js";

export type GrantIssuerConfig = {
  /** HMAC secret for signing/verifying channel grants (required). */
  secret: string;
  /** Grant lifetime in ms. Default 15 minutes. */
  grantTtlMs?: number;
  /** Renewal grace window in ms — a grant expired by up to this long still renews. Default 5 minutes. */
  renewGraceMs?: number;
};

/**
 * The stateless grant half of the live server — `serve` / `renew` / `hydration`, with no dependency
 * on Drizzle or a database. `createServer` composes this behind its writer stack; import it directly
 * from `rxfy-server/hub` for an app on the bare hub (e.g. an in-memory store) that wants signed
 * grants without the Drizzle writers.
 */
export type GrantIssuer = {
  /**
   * Parses `data` (the state's *input* shape — e.g. raw rows with unbranded ids and extra columns)
   * into the state's shape via the field schemas, then signs a grant for `stateChannel(state, params)`
   * whose claims also enumerate the payload's entity topics (`name:id`). Returns the parsed shape
   * (unknown keys stripped) with the grant attached as `$grant`. Stateless — nothing is stored; the
   * client presents the grant on its own subscribe frame, and the WS server authorizes exactly the
   * channel + entities the grant names.
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

export function createGrantIssuer(config: GrantIssuerConfig): GrantIssuer {
  const grantTtlMs = config.grantTtlMs ?? 15 * 60_000;
  const renewGraceMs = config.renewGraceMs ?? 5 * 60_000;
  return {
    serve(state, params, data) {
      const parsed = parseShape<Record<string, unknown>>(state.fields, data);
      const channel = stateChannel(state, params as Record<string, unknown>);
      if (!channel) throw new Error("rxfy-server: serve requires a keyed state");
      const entities = collectShapeTopics(state.fields as FieldsMap, parsed);
      return { ...parsed, $grant: signGrant({ channel, entities, secret: config.secret, ttlMs: grantTtlMs }) } as never;
    },
    renew(grant) {
      const claims = verifyGrant(grant, { secret: config.secret, graceMs: renewGraceMs });
      return claims === null
        ? null
        : signGrant({ channel: claims.channel, entities: claims.entities, secret: config.secret, ttlMs: grantTtlMs });
    },
    hydration(registry) {
      return grantsHydration(registry);
    },
  };
}
