import type { z } from "zod";

/** Extracts the key type from an entity's `id` field; falls back to `string` for plain string IDs. */
export type EntityKey<T> = T extends { id: infer TKey extends string } ? TKey : string;

export type ModelDescriptor<T, TKey extends string = string> = {
  readonly _key: symbol;
  /** Stable string identity for SSR dehydration — symbols cannot cross the server/client boundary. */
  readonly name?: string;
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly schema: z.ZodType<T, any>;
  readonly getKey: (item: T) => TKey;
};

// _shape is a phantom type — never set at runtime, exists only for TypeScript inference
export type FieldDescriptor<TShape> = {
  readonly _shape?: TShape;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any, any>;
};

// Both Zod generics are inferred so T comes from Output and TInput from Input —
// z.ZodType<T> alone would unify both positions and widen branded types away.
export function createModel<TOutput, TKey extends string, TInput = TOutput>(
  schema: z.ZodType<TOutput, TInput>,
  opts: { getKey: (item: TOutput) => TKey; name?: string },
): ModelDescriptor<TOutput, TKey> {
  return { _key: Symbol(), name: opts.name, schema, getKey: opts.getKey };
}

export function array<T, TKey extends string>(model: ModelDescriptor<T, TKey>): FieldDescriptor<T[]> {
  return { kind: "array", model } as FieldDescriptor<T[]>;
}

export function single<T, TKey extends string>(model: ModelDescriptor<T, TKey>): FieldDescriptor<T> {
  return { kind: "single", model } as FieldDescriptor<T>;
}
