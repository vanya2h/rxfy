import type { Resource } from "./storage.js";

/** Any resource, regardless of its insert/row/binding types. */
export type AnyResource = Resource<any, any, any>;

/** The resource in `TResources` whose `name` is `TName` (never if absent). */
type ResourceByName<TResources extends readonly AnyResource[], TName extends string> = Extract<
  TResources[number],
  { name: TName }
>;

/** Indexes resources by name — a convenience lookup for client wiring / tests. Not required by createSync. */
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
    if (byName.has(resource.name)) throw new Error(`rxfy-server: duplicate resource name "${resource.name}"`);
    byName.set(resource.name, resource);
  }
  return {
    byName: (name: string) => byName.get(name),
    model: (name: string) => byName.get(name)?.model,
    all: () => [...byName.values()],
  } as ResourceRegistry<TResources>;
}
