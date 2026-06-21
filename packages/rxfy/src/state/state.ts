import type { z } from "zod";
import type { EntityKey, FieldDescriptor } from "../model/model.js";

/** A field entry: an entity descriptor (`array`/`single`) or a bare zod schema for a plain value. */
export type FieldEntry = FieldDescriptor<any> | z.ZodType<any, any>;

export type FieldsMap = Record<string, FieldEntry>;

/** The denormalized shape: entity descriptors contribute their `_shape`, zod schemas their output type. */
export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : T[K] extends z.ZodType<infer O, any> ? O : never;
};

/** Entity field -> id (array) / id (single); plain zod field -> its value, passed through. */
export type QueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S>
    ? S extends readonly (infer Item)[]
      ? EntityKey<Item>[]
      : EntityKey<S>
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};

/** Writable counterpart: entity slots accept id|entity (array: a mix); plain zod field -> its value. */
export type WritableQueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S>
    ? S extends readonly (infer Item)[]
      ? (EntityKey<Item> | Item)[]
      : EntityKey<S> | S
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};

/** The normalized shape data$ emits, derived from a denormalized shape (entity-only; kept as a default). */
export type QueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[] ? EntityKey<Item>[] : EntityKey<TShape[K]>;
};

/**
 * The writable counterpart of QueryShapeOf: each model slot accepts an id OR a denormalized
 * entity (or a mix, for arrays). Used by setRaw, which normalizes object elements on write.
 */
export type WritableQueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[]
    ? (EntityKey<Item> | Item)[]
    : EntityKey<TShape[K]> | TShape[K];
};

export type MutationDefs<TShape> = {
  [key: string]: (prev: TShape, ...args: any[]) => TShape;
};

export type StateDescriptor<
  TParams,
  TShape,
  TMutations extends MutationDefs<TShape> = Record<never, never>,
  TQuery = QueryShapeOf<TShape>,
  TWritable = WritableQueryShapeOf<TShape>,
> = {
  /** Stable string identity for the SSR query cache. States without a key opt out of SSR caching. */
  readonly key?: string;
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly paramsSchema: z.ZodType<TParams, any>;
  // Deliberately erased to FieldsMap (not a per-key mapped type): the runtime discriminates each
  // entry with isFieldDescriptor, and per-field type fidelity is recovered through TQuery/TWritable.
  readonly fields: FieldsMap;
  readonly mutations: TMutations;
  /** Phantom carriers — never set at runtime — so TQuery/TWritable are inferable from a descriptor value. */
  readonly _query?: TQuery;
  readonly _writable?: TWritable;
};

// Overload: no mutations provided
export function defineState<TParams, TFields extends FieldsMap>(def: {
  key?: string;
  // TParams is inferred from the Output position only — z.ZodType<TParams> would also place it
  // in the Input position and widen branded types away.
  params: z.ZodType<TParams, any>;
  model: TFields;
  mutations?: undefined;
}): StateDescriptor<
  TParams,
  ShapeFromFields<TFields>,
  Record<never, never>,
  QueryShapeFromFields<TFields>,
  WritableQueryShapeFromFields<TFields>
>;

// Overload: mutations provided
export function defineState<
  TParams,
  TFields extends FieldsMap,
  TMutations extends MutationDefs<ShapeFromFields<TFields>>,
>(def: {
  key?: string;
  params: z.ZodType<TParams, any>;
  model: TFields;
  mutations: TMutations;
}): StateDescriptor<
  TParams,
  ShapeFromFields<TFields>,
  TMutations,
  QueryShapeFromFields<TFields>,
  WritableQueryShapeFromFields<TFields>
>;

// Implementation
export function defineState<
  TParams,
  TFields extends FieldsMap,
  TMutations extends MutationDefs<ShapeFromFields<TFields>>,
>(def: {
  key?: string;
  params: z.ZodType<TParams, any>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<
  TParams,
  ShapeFromFields<TFields>,
  TMutations | Record<never, never>,
  QueryShapeFromFields<TFields>,
  WritableQueryShapeFromFields<TFields>
> {
  return {
    key: def.key,
    paramsSchema: def.params,
    fields: def.model as any,
    mutations: (def.mutations ?? {}) as any,
  };
}
