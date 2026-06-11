import type { z } from "zod";
import type { FieldDescriptor } from "../model/model.js";

export type FieldsMap = Record<string, FieldDescriptor<any>>;

export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : never;
};

/** The normalized shape data$ emits: array fields become string[] (entity keys), single fields become string. */
export type QueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly unknown[] ? string[] : string;
};

export type MutationDefs<TShape> = {
  [key: string]: (prev: TShape, ...args: any[]) => TShape;
};

export type StateDescriptor<TParams, TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  /** Stable string identity for the SSR query cache. States without a key opt out of SSR caching. */
  readonly key?: string;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly fields: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
  readonly mutations: TMutations;
};

// Overload: no mutations provided
export function defineState<TParams, TFields extends FieldsMap>(def: {
  key?: string;
  params: z.ZodType<TParams>;
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
  params: z.ZodType<TParams>;
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
  params: z.ZodType<TParams>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations | {}> {
  return {
    key: def.key,
    paramsSchema: def.params,
    fields: def.model as any,
    mutations: (def.mutations ?? {}) as any,
  };
}
