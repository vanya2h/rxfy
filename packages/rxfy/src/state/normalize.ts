import type { z } from "zod";
import { type IncludeMap, isFieldDescriptor } from "../model/model.js";
import type { AnyModelDescriptor, IModelRegistry } from "../model/model-store.js";
import type { FieldsMap, QueryShapeOf, WritableQueryShapeOf } from "./state.js";

/**
 * Write one entity to its store, recursively extracting joined relations. For each relation the
 * `include` marks as joined, the payload carries the full child entity: recurse it into its own store
 * (honoring nested includes) and replace the field on the parent with the child's id. Relations the
 * include does not mention are left as whatever the payload holds (an id string, or absent). The
 * (relation-normalized) entity is stored raw with `set` — always replace. Returns the entity's key.
 */
export function writeEntity(
  registry: IModelRegistry,
  descriptor: AnyModelDescriptor,
  raw: unknown,
  include: IncludeMap | undefined,
  validate = false,
): string {
  const shaped: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [field, meta] of Object.entries(descriptor.relations)) {
    const joinSpec = include?.[field];
    if (!joinSpec) continue; // not joined for this fetch — leave the field as-is (id or absent)
    const value = shaped[field];
    if (value === undefined || value === null) continue; // joined declared but payload omitted it
    const nestedInclude = typeof joinSpec === "object" ? (joinSpec as IncludeMap) : undefined;
    shaped[field] =
      meta.kind === "array"
        ? (value as unknown[]).map((el) => writeEntity(registry, meta.model, el, nestedInclude, validate))
        : writeEntity(registry, meta.model, value, nestedInclude, validate);
  }
  // Validation (opt-in, dev-only) runs AFTER relation extraction so joined objects have already been
  // replaced by ids — the schema's `ref` fields expect an id, not the original nested object.
  if (validate && process.env.NODE_ENV !== "production") {
    const parsed = descriptor.schema.safeParse(shaped);
    if (!parsed.success) {
      throw new Error(`rxfy: invalid entity for model "${descriptor.name}": ${parsed.error.message}`);
    }
  }
  const key = descriptor.getKey(shaped as never);
  registry.model(descriptor).set(key, shaped);
  return key;
}

/** Dev-only validation for plain (non-entity) field values; pass-through in production. */
function devParse(schema: z.ZodType<any, any>, value: unknown, fieldName: string): unknown {
  if (process.env.NODE_ENV === "production") return value;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`rxfy: invalid value for plain field "${fieldName}": ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Parse one entity with its schema, recursing into joined relations (cleaned but kept nested). */
function parseEntity(descriptor: AnyModelDescriptor, raw: unknown, include: IncludeMap | undefined): unknown {
  const parsed = descriptor.schema.parse(raw) as Record<string, unknown>;
  const source = raw as Record<string, unknown>;
  for (const [field, meta] of Object.entries(descriptor.relations)) {
    const spec = include?.[field];
    if (!spec) continue; // not joined — leave the parsed id/undefined as-is
    const nested = source[field];
    if (nested === undefined || nested === null) continue;
    const nestedInclude = typeof spec === "object" ? (spec as IncludeMap) : undefined;
    parsed[field] =
      meta.kind === "array"
        ? (nested as unknown[]).map((el) => parseEntity(meta.model, el, nestedInclude))
        : parseEntity(meta.model, nested, nestedInclude);
  }
  return parsed;
}

/**
 * Parse a raw (input-typed) payload into the state's shape via the field schemas: entity fields
 * parse each element with their model schema (recursing into joined relations, kept nested), plain
 * fields with their own schema. Brands are applied and unknown keys stripped, so e.g. raw DB rows
 * become valid state data with no casts.
 */
export function parseShape<TShape>(fields: FieldsMap, input: unknown): TShape {
  const value: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldValue = (input as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      value[fieldName] = entry.parse(fieldValue);
      continue;
    }
    value[fieldName] =
      entry.kind === "array"
        ? (fieldValue as unknown[]).map((el) => parseEntity(entry.model, el, entry.include))
        : parseEntity(entry.model, fieldValue, entry.include);
  }
  return value as TShape;
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
    if (entry.kind === "array") {
      ids[fieldName] = (fieldValue as unknown[]).map((item) => writeEntity(registry, entry.model, item, entry.include));
    } else {
      ids[fieldName] = writeEntity(registry, entry.model, fieldValue, entry.include);
    }
  }
  return ids as QueryShapeOf<TShape>;
}

/**
 * `name:id` topics for every entity id a normalized query shape holds — the client's entity
 * subscription list for one payload. Names are model names (patches apply by model name), matching
 * the traversal of `normalizeResult`: array slots hold an id array, single slots hold one id, and
 * plain (zod) fields carry no entities.
 */
export function collectEntityTopics(fields: FieldsMap, query: Record<string, unknown>): string[] {
  const topics: string[] = [];
  for (const [fieldName, entry] of Object.entries(fields)) {
    if (!isFieldDescriptor(entry)) continue; // plain-value fields carry no entities
    const fieldValue = query[fieldName];
    if (entry.kind === "array") {
      for (const id of (fieldValue as string[]) ?? []) topics.push(`${entry.model.name}:${id}`);
    } else if (fieldValue !== undefined && fieldValue !== null) {
      topics.push(`${entry.model.name}:${fieldValue as string}`);
    }
  }
  return topics;
}

/** Push `name:id` for an entity and, per the include map, its joined relations (recursively). */
function collectFromEntity(
  descriptor: AnyModelDescriptor,
  entity: unknown,
  include: IncludeMap | undefined,
  out: string[],
): void {
  out.push(`${descriptor.name}:${descriptor.getKey(entity as never)}`);
  const source = entity as Record<string, unknown>;
  for (const [field, meta] of Object.entries(descriptor.relations)) {
    const spec = include?.[field];
    if (!spec) continue;
    const nested = source[field];
    if (nested === undefined || nested === null) continue;
    const nestedInclude = typeof spec === "object" ? (spec as IncludeMap) : undefined;
    if (meta.kind === "array") {
      for (const el of nested as unknown[]) collectFromEntity(meta.model, el, nestedInclude, out);
    } else {
      collectFromEntity(meta.model, nested, nestedInclude, out);
    }
  }
}

/**
 * `name:id` topics for every entity a *parsed* shape holds (full entities, pre-normalization),
 * descending into joined relations per each field's include — the server's authoritative subscription
 * list, signed into the grant. Reads the id off each entity via `model.getKey`.
 */
export function collectShapeTopics(fields: FieldsMap, shape: Record<string, unknown>): string[] {
  const topics: string[] = [];
  for (const [fieldName, entry] of Object.entries(fields)) {
    if (!isFieldDescriptor(entry)) continue; // plain-value fields carry no entities
    const value = shape[fieldName];
    if (entry.kind === "array") {
      for (const entity of (value as unknown[]) ?? []) collectFromEntity(entry.model, entity, entry.include, topics);
    } else if (value !== undefined && value !== null) {
      collectFromEntity(entry.model, value, entry.include, topics);
    }
  }
  return topics;
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
          `rxfy: entity "${key}" for model "${entry.model.name}" is missing from the store during denormalization`,
        );
      }
      return entity;
    };
    value[fieldName] = entry.kind === "array" ? (fieldIds as string[]).map(read) : read(fieldIds as string);
  }
  return value as TShape;
}

/**
 * Resolve one model-field element to its id: strings pass through; objects go through `writeEntity`
 * (with dev-validation on) so joined relations are extracted before the entity is validated & stored.
 */
function toEntityId(
  registry: IModelRegistry,
  model: AnyModelDescriptor,
  el: unknown,
  include: IncludeMap | undefined,
): string {
  if (typeof el === "string") return el; // already an id — passthrough, no store write
  return writeEntity(registry, model, el, include, true);
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
    if (entry.kind === "array") {
      ids[fieldName] = (fieldValue as unknown[]).map((el) => toEntityId(registry, entry.model, el, entry.include));
    } else {
      ids[fieldName] = toEntityId(registry, entry.model, fieldValue, entry.include);
    }
  }
  return ids as QueryShapeOf<TShape>;
}
