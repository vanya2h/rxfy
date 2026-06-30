import type { PgTable } from "drizzle-orm/pg-core";
import type { ModelDescriptor } from "rxfy";
import type { Resource } from "./resource.js";

type AnyResource = Resource<PgTable, any>;

/** Indexes resources by name for server writes and client live wiring. */
export type ResourceRegistry = {
  byName: (name: string) => AnyResource | undefined;
  model: (name: string) => ModelDescriptor<any> | undefined;
  all: () => AnyResource[];
};

export function createResourceRegistry(resources: AnyResource[]): ResourceRegistry {
  const byName = new Map<string, AnyResource>();
  for (const resource of resources) {
    if (byName.has(resource.name)) {
      throw new Error(`rxfy-server: duplicate resource name "${resource.name}"`);
    }
    byName.set(resource.name, resource);
  }
  return {
    byName: (name) => byName.get(name),
    model: (name) => byName.get(name)?.model,
    all: () => [...byName.values()],
  };
}
