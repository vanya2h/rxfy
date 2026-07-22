import type { z } from "zod";
import type { EntityKey, FieldDescriptor, IncludeMap, JoinSpec, StoreKey } from "../model/model.js";

// `ref()` fields infer as `StoreKey<R> | undefined` and `refArray()` as `StoreKey<R>[] | undefined`,
// so relation detection strips the `| undefined` with NonNullable before matching.
type IsRelation<V> =
  NonNullable<V> extends StoreKey<any> ? true : NonNullable<V> extends StoreKey<any>[] ? true : false;

/** Non-relation fields of an entity (plain columns like id, title, categoryId). */
type OmitRelations<TEntity> = {
  [K in keyof TEntity as IsRelation<TEntity[K]> extends true ? never : K]: TEntity[K];
};

/**
 * The joined relations named in an include map, each re-typed as a StoreKey of its own (recursively
 * joined) view. Relations not in the include map are absent here — and OmitRelations dropped them too,
 * so an un-joined relation is omitted from the final view entirely.
 */
type JoinedRelations<TEntity, TInclude extends IncludeMap> = {
  [K in keyof TInclude & keyof TEntity]: NonNullable<TEntity[K]> extends StoreKey<infer R>
    ? TInclude[K] extends JoinSpec
      ? StoreKey<EntityView<R, TInclude[K]["include"]>>
      : StoreKey<OmitRelations<R>>
    : NonNullable<TEntity[K]> extends StoreKey<infer R>[]
      ? TInclude[K] extends JoinSpec
        ? StoreKey<EntityView<R, TInclude[K]["include"]>>[]
        : StoreKey<OmitRelations<R>>[]
      : never;
};

/** Collapse an intersection into a single object literal so `A & {}` reads as `A` (exact type equality). */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** A model entity as seen through an include map: non-relations + joined relations; un-joined dropped. */
export type EntityView<TEntity, TInclude extends IncludeMap> = Simplify<
  OmitRelations<TEntity> & JoinedRelations<TEntity, TInclude>
>;

/** A field entry: an entity descriptor (`array`/`single`) or a bare zod schema for a plain value. */
export type FieldEntry = FieldDescriptor<any> | z.ZodType<any, any>;

export type FieldsMap = Record<string, FieldEntry>;

/** The denormalized shape: entity descriptors contribute their `_shape`, zod schemas their output type. */
export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : T[K] extends z.ZodType<infer O, any> ? O : never;
};

/** Entity field -> id (array) / id (single); plain zod field -> its value, passed through. */
export type QueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S, any, infer Inc>
    ? S extends readonly (infer Item)[]
      ? StoreKey<EntityView<Item, Inc>>[]
      : StoreKey<EntityView<S, Inc>>
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};

/**
 * The denormalized *input* shape: what a raw fetch/serve payload looks like before schema parsing.
 * Entity fields accept their model schema's Input (e.g. unbranded ids, extra DB columns allowed by
 * width subtyping); plain zod fields accept their schema's Input.
 */
export type InputShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<any, infer I> ? I : T[K] extends z.ZodType<any, infer I> ? I : never;
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
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[] ? StoreKey<Item>[] : StoreKey<TShape[K]>;
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
  TShapeInput = TShape,
> = {
  /** Stable string identity for the SSR query cache and the live invalidation channel. */
  readonly key: string;
  /** Param names that slice *within* a dataset (page, cursor, sort) — excluded from the live invalidation channel. */
  readonly window?: readonly (keyof TParams & string)[];
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly paramsSchema: z.ZodType<TParams, any>;
  // Deliberately erased to FieldsMap (not a per-key mapped type): the runtime discriminates each
  // entry with isFieldDescriptor, and per-field type fidelity is recovered through TQuery/TWritable.
  readonly fields: FieldsMap;
  readonly mutations: TMutations;
  /** Phantom carriers — never set at runtime — so TShape/TQuery/TWritable are inferable from a descriptor value. */
  readonly _shape?: TShape;
  readonly _query?: TQuery;
  readonly _writable?: TWritable;
  /** Phantom input-shape carrier — function-typed to keep TShapeInput contravariant, as an input should be. */
  readonly _shapeInput?: (input: TShapeInput) => void;
};

// Overload: no mutations provided
export function defineState<TParams, TFields extends FieldsMap>(def: {
  key: string;
  // Window entries must name actual params — TParams is inferred from `params` alone (keyof
  // positions contribute no inference candidates), then each entry is checked against it.
  window?: readonly (keyof TParams & string)[];
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
  WritableQueryShapeFromFields<TFields>,
  InputShapeFromFields<TFields>
>;

// Overload: mutations provided
export function defineState<
  TParams,
  TFields extends FieldsMap,
  TMutations extends MutationDefs<ShapeFromFields<TFields>>,
>(def: {
  key: string;
  window?: readonly (keyof TParams & string)[];
  params: z.ZodType<TParams, any>;
  model: TFields;
  mutations: TMutations;
}): StateDescriptor<
  TParams,
  ShapeFromFields<TFields>,
  TMutations,
  QueryShapeFromFields<TFields>,
  WritableQueryShapeFromFields<TFields>,
  InputShapeFromFields<TFields>
>;

export function defineState<
  TParams,
  TFields extends FieldsMap,
  TMutations extends MutationDefs<ShapeFromFields<TFields>>,
>(def: {
  key: string;
  window?: readonly (keyof TParams & string)[];
  params: z.ZodType<TParams, any>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<
  TParams,
  ShapeFromFields<TFields>,
  TMutations | Record<never, never>,
  QueryShapeFromFields<TFields>,
  WritableQueryShapeFromFields<TFields>,
  InputShapeFromFields<TFields>
> {
  return {
    key: def.key,
    window: def.window,
    paramsSchema: def.params,
    fields: def.model,
    mutations: def.mutations ?? {},
  };
}
