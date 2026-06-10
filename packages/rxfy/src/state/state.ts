import type { z } from "zod";
import type { FieldDescriptor } from "../model/model.js";

export type FieldsMap = Record<string, FieldDescriptor<any>>;

export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : never;
};

export type StateDescriptor<TParams, TShape> = {
  readonly paramsSchema: z.ZodType<TParams>;
  readonly fields: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
};

export function defineState<TParams, TFields extends FieldsMap>(def: {
  params: z.ZodType<TParams>;
  model: TFields;
}): StateDescriptor<TParams, ShapeFromFields<TFields>> {
  return {
    paramsSchema: def.params,
    fields: def.model as { [K in keyof ShapeFromFields<TFields>]: FieldDescriptor<ShapeFromFields<TFields>[K]> },
  };
}
