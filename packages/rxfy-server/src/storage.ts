import type { ModelDescriptor } from "rxfy";

/**
 * A storage-neutral live resource: the client-facing model + key extractor, plus an opaque
 * `binding` that only its adapter understands. `TInsert` types the create/update payloads; `TRow`
 * the persisted row; `TBinding` is uniform per adapter and matched against the storage.
 */
export type Resource<TInsert = unknown, TRow = unknown, TBinding = unknown> = {
  /** Topic namespace / rxfy model name — live patches publish under this. */
  name: string;
  /** The rxfy model for the client store / live routing. */
  model: ModelDescriptor<TRow>;
  /** Extract the entity key from a row (for the patch topic). */
  getKey: (row: TRow) => string;
  /** Adapter-specific handle (a Drizzle table binding, an in-memory Map, …). Opaque to core. */
  binding: TBinding;
  /** Phantom — types the insert shape for create/update. Never read at runtime. */
  readonly _insert?: TInsert;
};

/**
 * The persistence port. Generic over the binding so a storage accepts only its own adapter's
 * resources. Row/values payloads stay `unknown` here (a generic storage can't know them); their
 * precise types live on the `Resource` generics and surface through `Live`'s write methods.
 */
export type LiveStorage<TBinding = unknown> = {
  /** Insert values, return the persisted row. Throws on failure (a store bug). */
  create(binding: TBinding, values: unknown): Promise<unknown>;
  /** Update the row by id, return it — or undefined when no row matches (not found). */
  update(binding: TBinding, id: string, values: unknown): Promise<unknown | undefined>;
  /** Delete the row by id. */
  delete(binding: TBinding, id: string): Promise<void>;
};
