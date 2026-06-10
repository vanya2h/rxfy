import type { z } from "zod";

export type ModelDescriptor<T> = {
  readonly _key: symbol;
  readonly schema: z.ZodType<T>;
  readonly getKey: (item: T) => string;
};

// _shape is a phantom type — never set at runtime, exists only for TypeScript inference
export type FieldDescriptor<TShape> = {
  readonly _shape?: TShape;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any>;
};

export function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string },
): ModelDescriptor<T> {
  return { _key: Symbol(), schema, getKey: opts.getKey };
}

export function array<T>(model: ModelDescriptor<T>): FieldDescriptor<T[]> {
  return { kind: "array", model } as FieldDescriptor<T[]>;
}

export function single<T>(model: ModelDescriptor<T>): FieldDescriptor<T> {
  return { kind: "single", model } as FieldDescriptor<T>;
}
