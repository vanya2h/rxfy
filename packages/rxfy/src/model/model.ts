import type { z } from "zod";

/** Extracts the key type from an entity's `id` field; falls back to `string` for plain string IDs. */
export type EntityKey<TEntity> = TEntity extends { id: infer TKey extends string } ? TKey : string;

export type ModelDescriptor<TEntity, TKey extends string = string, TInput = TEntity, TName extends string = string> = {
  readonly _key: symbol;
  /** Stable string identity for SSR dehydration and live topics — symbols cannot cross the server/client boundary. Carried as a literal type so registries can key typed lookups by name. */
  readonly name: TName;
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly schema: z.ZodType<TEntity, any>;
  readonly getKey: (item: TEntity) => TKey;
  /** Phantom carrier — never set at runtime — so the schema's Input type (e.g. unbranded rows) survives on the descriptor. Function-typed to keep TInput contravariant, as an input should be. */
  readonly _input?: (input: TInput) => void;
};

// _shape/_input are phantom types — never set at runtime, they exist only for TypeScript inference
export type FieldDescriptor<TShape, TInput = TShape> = {
  readonly _shape?: TShape;
  readonly _input?: (input: TInput) => void;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any, any>;
};

export type CreateModelConfig<TEntity, TKey extends string, TInput = TEntity, TName extends string = string> = {
  schema: z.ZodType<TEntity, TInput>;
  getKey: (item: TEntity) => TKey;
  name: TName;
};

// Both Zod generics are inferred so TEntity comes from Output and TInput from Input —
// z.ZodType<TEntity> alone would unify both positions and widen branded types away.
export function createModel<TEntity, TKey extends string, TInput = TEntity, TName extends string = string>({
  schema,
  getKey,
  name,
}: CreateModelConfig<TEntity, TKey, TInput, TName>): ModelDescriptor<TEntity, TKey, TInput, TName> {
  return { _key: Symbol(), name, schema, getKey };
}

export function array<TEntity, TKey extends string, TInput = TEntity>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): FieldDescriptor<TEntity[], TInput[]> {
  return { kind: "array", model } as FieldDescriptor<TEntity[], TInput[]>;
}

export function single<TEntity, TKey extends string, TInput = TEntity>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): FieldDescriptor<TEntity, TInput> {
  return { kind: "single", model } as FieldDescriptor<TEntity, TInput>;
}

/** True when a field entry is an entity descriptor (`array`/`single`) rather than a bare zod schema. */
export function isFieldDescriptor(x: unknown): x is FieldDescriptor<any> {
  return (
    typeof x === "object" &&
    x !== null &&
    ((x as { kind?: unknown }).kind === "array" || (x as { kind?: unknown }).kind === "single")
  );
}
