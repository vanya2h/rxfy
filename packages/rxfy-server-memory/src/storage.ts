import type { SyncStorage } from "rxfy-server";
import type { MemoryBinding } from "./collection.js";

/** A `SyncStorage` over in-memory `defineCollection` maps. Stateless — the data lives in each binding. */
export function memoryStorage(): SyncStorage<MemoryBinding> {
  return {
    async create(binding, values) {
      binding.rows.set(binding.getKey(values), values);
      return values;
    },
    async update(binding, id, values) {
      const existing = binding.rows.get(id);
      if (existing === undefined) return undefined;
      const row = { ...(existing as object), ...(values as object) };
      binding.rows.set(id, row);
      return row;
    },
    async delete(binding, id) {
      binding.rows.delete(id);
    },
  };
}
