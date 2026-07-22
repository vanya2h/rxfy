import { z } from "zod";

/** Extracts the key type from an entity's `id` field; falls back to `string` for plain string IDs. */
export type EntityKey<TEntity> = TEntity extends { id: infer TKey extends string } ? TKey : string;

/**
 * A store key the framework minted for a specific model's store. A required phantom brand (never
 * present at runtime) so a bare `string` is NOT assignable to it — this is what lets `ModelStore.get`
 * reject arbitrary ids. Still a subtype of `string`, so interpolation/keys/`String(...)` are unaffected.
 * The query-shape layer produces these; `asKey` is the explicit door for a genuinely-raw id.
 */
export type StoreKey<TEntity> = EntityKey<TEntity> & { readonly __store: (e: TEntity) => void };

export type ModelDescriptor<TEntity, TKey extends string = string, TInput = TEntity, TName extends string = string> = {
  readonly _key: symbol;
  /** Stable string identity for SSR dehydration and live topics — symbols cannot cross the server/client boundary. Carried as a literal type so registries can key typed lookups by name. */
  readonly name: TName;
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly schema: z.ZodType<TEntity, any>;
  readonly getKey: (item: TEntity) => TKey;
  /** Phantom carrier — never set at runtime — so the schema's Input type (e.g. unbranded rows) survives on the descriptor. Function-typed to keep TInput contravariant, as an input should be. */
  readonly _input?: (input: TInput) => void;
  /** Relation fields (from `ref`/`refArray`) keyed by field name; derived at `createModel` time. */
  readonly relations: Readonly<Record<string, RelationMeta>>;
};

export type IncludeMap = Record<string, true | JoinSpec>;
export type JoinSpec = {
  readonly kind: "join";
  readonly model: ModelDescriptor<any, any>;
  readonly include: IncludeMap;
};

// _shape/_input are phantom types — never set at runtime, they exist only for TypeScript inference
export type FieldDescriptor<TShape, TInput = TShape, TInclude extends IncludeMap = Record<never, never>> = {
  readonly _shape?: TShape;
  readonly _input?: (input: TInput) => void;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any, any>;
  /** Which relations this state field joins; drives recursive normalization and the query-shape type. */
  readonly include?: TInclude;
  /** Attach an include map (which relations to join for this fetch). */
  readonly with: <TNext extends IncludeMap>(include: TNext) => FieldDescriptor<TShape, TInput, TNext>;
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
  return { _key: Symbol(), name, schema, getKey, relations: collectRelations(schema, name) };
}

/** Walk a model schema's top-level `.shape` and collect any relation-tagged fields (`ref`/`refArray`). */
function collectRelations(schema: z.ZodType<any, any>, name: string): Record<string, RelationMeta> {
  // In zod 4, `.shape` is present on ZodObject and preserved through `.brand()`/`.refine()`; only true
  // wrappers (intersection, union, …) drop it. If it's unreachable a relation could be silently missed.
  const shape = (schema as { shape?: Record<string, z.ZodType<any, any>> }).shape;
  if (!shape || typeof shape !== "object") {
    throw new Error(`rxfy: model "${name}" schema must be a plain object to declare relation fields`);
  }
  const relations: Record<string, RelationMeta> = {};
  for (const [field, fieldSchema] of Object.entries(shape)) {
    const meta = relationRegistry.get(fieldSchema) as RelationMeta | undefined;
    if (meta) relations[field] = meta;
  }
  return relations;
}

/** The entity type carried by a model descriptor. */
export type EntityOfModel<TDescriptor> =
  TDescriptor extends ModelDescriptor<infer TEntity, any, any, any> ? TEntity : never;

/** Brand a raw id (e.g. a URL param) as a `StoreKey` for a model. The one sanctioned cast into the keyspace. */
export function asKey<TDescriptor extends ModelDescriptor<any, any, any, any>>(
  _model: TDescriptor,
  id: string,
): StoreKey<EntityOfModel<TDescriptor>> {
  return id as StoreKey<EntityOfModel<TDescriptor>>;
}

export type RelationMeta = { readonly model: ModelDescriptor<any, any>; readonly kind: "single" | "array" };

/**
 * Attaches relation metadata to a field schema so `createModel` can find it while walking `.shape`.
 * The registry's meta type is loose (`model: unknown`) on purpose: embedding a `ModelDescriptor` —
 * and thus a `z.ZodType` — in the registry's meta makes zod's recursive check types self-compare and
 * blow up. Reads are cast back to `RelationMeta`.
 */
export const relationRegistry = z.registry<{ model: unknown; kind: "single" | "array" }>();

/**
 * Declare a to-one relation field inside a model schema. Output type is the referenced entity's
 * `StoreKey` (optional — the field is absent on a fetch that did not join it); input accepts the id
 * or the joined entity so joined payloads type-check. Store extraction happens in `writeEntity`, not
 * in zod parse — here it is purely a marker + type.
 */
export function ref<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): z.ZodType<StoreKey<TEntity> | undefined, StoreKey<TEntity> | TInput | undefined> {
  // Accepts undefined (field absent when not joined) or a string id (after normalization).
  const schema = z.custom<StoreKey<TEntity> | undefined>((v) => v === undefined || typeof v === "string");
  schema.register(relationRegistry, { model, kind: "single" });
  return schema as unknown as z.ZodType<StoreKey<TEntity> | undefined, StoreKey<TEntity> | TInput | undefined>;
}

/** Declare a to-many relation field inside a model schema (array of `ref`). Optional for the same reason. */
export function refArray<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): z.ZodType<StoreKey<TEntity>[] | undefined, (StoreKey<TEntity> | TInput)[] | undefined> {
  const schema = z.custom<StoreKey<TEntity>[] | undefined>((v) => v === undefined || Array.isArray(v));
  schema.register(relationRegistry, { model, kind: "array" });
  return schema as unknown as z.ZodType<StoreKey<TEntity>[] | undefined, (StoreKey<TEntity> | TInput)[] | undefined>;
}

/** Standalone nested include used inside a parent `.with(...)` to join a relation's own relations. */
export function join<TEntity, TKey extends string>(
  model: ModelDescriptor<TEntity, TKey>,
  include: IncludeMap,
): JoinSpec {
  return { kind: "join", model: model as ModelDescriptor<any, any>, include };
}

function makeField<TShape, TInput>(
  kind: "single" | "array",
  model: ModelDescriptor<any, any>,
): FieldDescriptor<TShape, TInput> {
  const field = {
    kind,
    model,
    with: <TNext extends IncludeMap>(include: TNext) =>
      ({ ...field, include }) as unknown as FieldDescriptor<TShape, TInput, TNext>,
  } as unknown as FieldDescriptor<TShape, TInput>;
  return field;
}

export function array<TEntity, TKey extends string, TInput = TEntity>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): FieldDescriptor<TEntity[], TInput[]> {
  return makeField<TEntity[], TInput[]>("array", model as ModelDescriptor<any, any>);
}

export function single<TEntity, TKey extends string, TInput = TEntity>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): FieldDescriptor<TEntity, TInput> {
  return makeField<TEntity, TInput>("single", model as ModelDescriptor<any, any>);
}

/** True when a field entry is an entity descriptor (`array`/`single`) rather than a bare zod schema. */
export function isFieldDescriptor(x: unknown): x is FieldDescriptor<any> {
  return (
    typeof x === "object" &&
    x !== null &&
    ((x as { kind?: unknown }).kind === "array" || (x as { kind?: unknown }).kind === "single")
  );
}
