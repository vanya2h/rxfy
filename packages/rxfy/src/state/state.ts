import type { z } from "zod";
import type { EntityKey, FieldDescriptor } from "../model/model.js";

export type FieldsMap = Record<string, FieldDescriptor<any>>;

export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : never;
};

/** The normalized shape data$ emits: array fields become entity key arrays, single fields become entity keys. */
export type QueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[] ? EntityKey<Item>[] : EntityKey<TShape[K]>;
};

export type MutationDefs<TShape> = {
  [key: string]: (prev: TShape, ...args: any[]) => TShape;
};

export type StateDescriptor<TParams, TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  /** Stable string identity for the SSR query cache. States without a key opt out of SSR caching. */
  readonly key?: string;
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly paramsSchema: z.ZodType<TParams, any>;
  readonly fields: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
  readonly mutations: TMutations;
};

// Overload: no mutations provided
export function defineState<TParams, TFields extends FieldsMap>(def: {
  key?: string;
  // TParams is inferred from the Output position only — z.ZodType<TParams> would also place it
  // in the Input position and widen branded types away.
  params: z.ZodType<TParams, any>;
  model: TFields;
  mutations?: undefined;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, Record<never, never>>;

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
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations>;

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
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations | Record<never, never>> {
  return {
    key: def.key,
    paramsSchema: def.params,
    fields: def.model as any,
    mutations: (def.mutations ?? {}) as any,
  };
}
