import type { PgTable } from "drizzle-orm/pg-core";
import type { Resource } from "./resource.js";

/** Any resource, regardless of its table/row/name types. */
export type AnyResource = Resource<PgTable, any, string>;

/** The resource in `TResources` whose `name` is `TName` (never if absent). */
type ResourceByName<TResources extends readonly AnyResource[], TName extends string> = Extract<
  TResources[number],
  { name: TName }
>;

/** Indexes resources by name for server writes and client live wiring, preserving their types. */
export type ResourceRegistry<TResources extends readonly AnyResource[] = readonly AnyResource[]> = {
  byName: <TName extends string>(name: TName) => ResourceByName<TResources, TName> | undefined;
  model: <TName extends string>(name: TName) => ResourceByName<TResources, TName>["model"] | undefined;
  all: () => TResources[number][];
};

export function createResourceRegistry<const TResources extends readonly AnyResource[]>(
  resources: TResources,
): ResourceRegistry<TResources> {
  const byName = new Map<string, AnyResource>();
  for (const resource of resources) {
    if (byName.has(resource.name)) {
      throw new Error(`rxfy-server: duplicate resource name "${resource.name}"`);
    }
    byName.set(resource.name, resource);
  }
  return {
    byName: (name: string) => byName.get(name),
    model: (name: string) => byName.get(name)?.model,
    all: () => [...byName.values()],
  } as ResourceRegistry<TResources>;
}
