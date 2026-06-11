import type { z } from "zod";
import type { FieldDescriptor } from "../model/model.js";

export type FieldsMap = Record<string, FieldDescriptor<any>>;

export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : never;
};

export type MutationDefs<TShape> = {
  [key: string]: (prev: TShape, ...args: any[]) => TShape;
};

export type StateDescriptor<TParams, TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  readonly paramsSchema: z.ZodType<TParams>;
  readonly fields: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
  readonly mutations: TMutations;
};

// Overload: no mutations provided
export function defineState<TParams, TFields extends FieldsMap>(def: {
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
  params: z.ZodType<TParams>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations | {}> {
  return {
    paramsSchema: def.params,
    fields: def.model as any,
    mutations: (def.mutations ?? {}) as any,
  };
}
