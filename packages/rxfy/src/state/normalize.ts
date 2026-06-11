import type { IModelRegistry } from "../model/model-store.js";
import type { FieldsMap, QueryShapeOf } from "./state.js";

/** Splits a denormalized fetch result: entities → model stores, ids → returned query shape. */
export function normalizeResult<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: TShape,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, desc] of Object.entries(fields)) {
    const store = registry.model(desc.model);
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (desc.kind === "array") {
      const items = fieldValue as unknown[];
      store.setMany(items);
      ids[fieldName] = items.map((item) => desc.model.getKey(item));
    } else {
      const key = desc.model.getKey(fieldValue);
      store.set(key, fieldValue);
      ids[fieldName] = key;
    }
  }
  return ids as QueryShapeOf<TShape>;
}

/** Rebuilds the fetch shape from ids by reading store value maps — reducers always see the freshest entities. */
export function denormalizeValue<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  ids: QueryShapeOf<TShape>,
): TShape {
  const value: Record<string, unknown> = {};
  for (const [fieldName, desc] of Object.entries(fields)) {
    const store = registry.model(desc.model);
    const read = (key: string): unknown => {
      const entity = store.getValue(key);
      if (entity === undefined) {
        throw new Error(
          `rxfy: entity "${key}" for model "${desc.model.name ?? "<unnamed>"}" is missing from the store during denormalization`,
        );
      }
      return entity;
    };
    const fieldIds = (ids as Record<string, unknown>)[fieldName];
    value[fieldName] = desc.kind === "array" ? (fieldIds as string[]).map(read) : read(fieldIds as string);
  }
  return value as TShape;
}
