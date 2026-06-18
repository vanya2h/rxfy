import type { z } from "zod";
import { isFieldDescriptor, type ModelDescriptor } from "../model/model.js";
import type { IModelRegistry, ModelStore } from "../model/model-store.js";
import type { FieldsMap, QueryShapeOf, WritableQueryShapeOf } from "./state.js";

/** Dev-only validation for plain (non-entity) field values; pass-through in production. */
function devParse(schema: z.ZodType<any, any>, value: unknown, fieldName: string): unknown {
  if (process.env.NODE_ENV === "production") return value;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`rxfy: invalid value for plain field "${fieldName}": ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Splits a denormalized fetch result: entities → model stores, ids → returned query shape. Plain values pass through. */
export function normalizeResult<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: TShape,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      ids[fieldName] = devParse(entry, fieldValue, fieldName);
      continue;
    }
    const store = registry.model(entry.model);
    if (entry.kind === "array") {
      const items = fieldValue as unknown[];
      store.setMany(items);
      ids[fieldName] = items.map((item) => entry.model.getKey(item));
    } else {
      const key = entry.model.getKey(fieldValue);
      store.set(key, fieldValue);
      ids[fieldName] = key;
    }
  }
  return ids as QueryShapeOf<TShape>;
}

/** Rebuilds the fetch shape from ids by reading store value maps; plain values are copied verbatim. */
export function denormalizeValue<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  ids: WritableQueryShapeOf<TShape>,
): TShape {
  const value: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldIds = (ids as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      value[fieldName] = fieldIds;
      continue;
    }
    const store = registry.model(entry.model);
    const read = (key: string): unknown => {
      const entity = store.getValue(key);
      if (entity === undefined) {
        throw new Error(
          `rxfy: entity "${key}" for model "${entry.model.name ?? "<unnamed>"}" is missing from the store during denormalization`,
        );
      }
      return entity;
    };
    value[fieldName] = entry.kind === "array" ? (fieldIds as string[]).map(read) : read(fieldIds as string);
  }
  return value as TShape;
}

/** Resolve one model-field element to its id, writing the entity to its store when given an object. */
function toEntityId(store: ModelStore<any>, model: ModelDescriptor<any, any>, el: unknown): string {
  if (typeof el === "string") return el; // already an id — passthrough, no store write
  if (process.env.NODE_ENV !== "production") {
    const parsed = model.schema.safeParse(el);
    if (!parsed.success) {
      throw new Error(
        `rxfy: invalid entity passed to setRaw for model "${model.name ?? "<unnamed>"}": ${parsed.error.message}`,
      );
    }
  }
  const key = model.getKey(el);
  store.set(key, el);
  return key;
}

/**
 * Like normalizeResult, but tolerates already-normalized ids mixed with denormalized entities:
 * string elements pass through as ids; object elements are written to their store. Plain (zod)
 * fields pass through, dev-validated. Used by setRaw so callers can append entities without a
 * manual normalizeResult round-trip.
 */
export function normalizeWritable<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: WritableQueryShapeOf<TShape>,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      ids[fieldName] = devParse(entry, fieldValue, fieldName);
      continue;
    }
    const store = registry.model(entry.model);
    if (entry.kind === "array") {
      ids[fieldName] = (fieldValue as unknown[]).map((el) => toEntityId(store, entry.model, el));
    } else {
      ids[fieldName] = toEntityId(store, entry.model, fieldValue);
    }
  }
  return ids as QueryShapeOf<TShape>;
}
