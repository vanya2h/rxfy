import { z } from "zod";

/** Extracts the key type from an entity's `id` field; falls back to `string` for plain string IDs. */
export type EntityKey<TEntity> = TEntity extends { id: infer TKey extends string } ? TKey : string;

/**
 * A store key the framework minted for a specific model's store. A required phantom brand (never
 * present at runtime) so a bare `string` is NOT assignable to it — this is what lets `ModelStore.get`
 * reject arbitrary ids. Still a subtype of `string`, so interpolation/keys/`String(...)` are unaffected.
 * The query-shape layer produces these; `asKey` is the explicit door for a genuinely-raw id.
 */
export type StoreKey<TEntity> = EntityKey<TEntity> & { readonly __store: TEntity };

/**
 * The entity a `StoreKey` points at — the covariant brand carries the *view* it was minted for, so a key
 * from a joined query shape derefs to that view (joined relations present). Lets app code name a child's
 * ref type without repeating a `extends StoreKey<infer …>` conditional: `ViewOf<PostRef>["comments"]`.
 */
export type ViewOf<TKey> = TKey extends StoreKey<infer TEntity> ? TEntity : never;

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

/**
 * A recursive relation-include map (the runtime shape). Each key is a relation field: `true` joins it
 * flat, a nested map joins its own relations too — Prisma's `include` style: `{ category: { parent: true } }`.
 */
export type IncludeMap = { readonly [field: string]: true | IncludeMap };

/** The referenced entity type behind a relation field value (`StoreKey<R>` for `ref`, `StoreKey<R>[]` for `refArray`). */
type RelationEntity<V> =
  NonNullable<V> extends StoreKey<infer R> ? R : NonNullable<V> extends StoreKey<infer R>[] ? R : never;

/** Type-safe include over an entity's relation fields; recurses into each relation's own relations. */
export type IncludeForEntity<TEntity> = {
  [K in RelationFieldNames<TEntity>]?: true | IncludeForEntity<RelationEntity<TEntity[K]>>;
};

/** Type-safe include for a field shape — unwraps arrays to their element entity. */
export type IncludeFor<TShape> = TShape extends readonly (infer E)[] ? IncludeForEntity<E> : IncludeForEntity<TShape>;

// _shape/_input are phantom types — never set at runtime, they exist only for TypeScript inference
export type FieldDescriptor<TShape, TInput = TShape, TInclude = Record<never, never>> = {
  readonly _shape?: TShape;
  readonly _input?: (input: TInput) => void;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any, any>;
  /** Which relations this state field joins; drives recursive normalization and the query-shape type. */
  readonly include?: TInclude;
  /**
   * Join relations for this fetch (Prisma-`include` style). Keys autocomplete to the model's relation
   * fields; a value of `true` joins the relation flat, a nested map joins its own relations recursively:
   * `single(Post).with({ category: { parent: true } })`.
   */
  readonly with: <TNext extends IncludeFor<TShape>>(include: TNext) => FieldDescriptor<TShape, TInput, TNext>;
};

/** True when a field's value type is a relation reference (`ref` → `StoreKey<R>`, `refArray` → `StoreKey<R>[]`). */
type IsRelationField<V> =
  NonNullable<V> extends StoreKey<any> ? true : NonNullable<V> extends StoreKey<any>[] ? true : false;

/** The relation field names of a model entity (fields declared with `ref`/`refArray`). */
export type RelationFieldNames<TEntity> = {
  [K in keyof TEntity]-?: IsRelationField<TEntity[K]> extends true ? K : never;
}[keyof TEntity] &
  string;

/** Field names eligible as a foreign key: plain string columns that are not themselves relations. */
export type FkFieldNames<TEntity> = {
  [K in keyof TEntity]-?: IsRelationField<TEntity[K]> extends true
    ? never
    : NonNullable<TEntity[K]> extends string
      ? K
      : never;
}[keyof TEntity] &
  string;

/**
 * Type-safe foreign-key linkage: maps each relation field to the FK column it mirrors. Both sides are
 * inferred from the model's schema — `{ category: "categoryId" }` autocompletes and rejects unknown names.
 * Lives on `createModel` (not `ref`) because only here is the parent's field set a known type.
 */
export type FkMap<TEntity> = [RelationFieldNames<TEntity>] extends [never]
  ? Record<string, never> // no relations: forbid all keys rather than collapsing to `{}`, which accepts anything
  : Partial<Record<RelationFieldNames<TEntity>, FkFieldNames<TEntity>>>;

export type CreateModelConfig<TEntity, TKey extends string, TInput = TEntity, TName extends string = string> = {
  schema: z.ZodType<TEntity, TInput>;
  getKey: (item: TEntity) => TKey;
  name: TName;
  /** Type-safe FK linkage per relation, e.g. `{ category: "categoryId" }`; both sides inferred from the schema. */
  fk?: FkMap<TEntity>;
};

// Both Zod generics are inferred so TEntity comes from Output and TInput from Input —
// z.ZodType<TEntity> alone would unify both positions and widen branded types away.
export function createModel<TEntity, TKey extends string, TInput = TEntity, TName extends string = string>({
  schema,
  getKey,
  name,
  fk,
}: CreateModelConfig<TEntity, TKey, TInput, TName>): ModelDescriptor<TEntity, TKey, TInput, TName> {
  return { _key: Symbol(), name, schema, getKey, relations: collectRelations(schema, name, fk) };
}

/** Walk a model schema's top-level `.shape` and collect any relation-tagged fields (`ref`/`refArray`). */
function collectRelations(
  schema: z.ZodType<any, any>,
  name: string,
  fk?: Record<string, string | undefined>,
): Record<string, RelationMeta> {
  // In zod 4, `.shape` is present on ZodObject and preserved through `.brand()`/`.refine()`; only true
  // wrappers (intersection, union, …) drop it. If it's unreachable a relation could be silently missed.
  const shape = (schema as { shape?: Record<string, z.ZodType<any, any>> }).shape;
  if (!shape || typeof shape !== "object") {
    throw new Error(`rxfy: model "${name}" schema must be a plain object to declare relation fields`);
  }
  const relations: Record<string, RelationMeta> = {};
  for (const [field, fieldSchema] of Object.entries(shape)) {
    const meta = relationRegistry.get(fieldSchema) as RelationMeta | undefined;
    if (meta) relations[field] = fk?.[field] ? { ...meta, fk: fk[field] } : meta;
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

export type RelationMeta = {
  readonly model: ModelDescriptor<any, any>;
  readonly kind: "single" | "array";
  /** Sibling foreign-key column this relation mirrors; lets flat sync patches keep the relation id. */
  readonly fk?: string;
};

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
 * in zod parse — here it is purely a marker + type. FK linkage (for sync patches) is declared on
 * `createModel`'s `fk` map, where the parent's field names are a known type.
 */
export function ref<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): z.ZodOptional<z.ZodType<StoreKey<TEntity>, StoreKey<TEntity> | TInput>> {
  // `.optional()` so the key may be absent (a non-joined payload omits it, and a raw entity row has
  // no relation column). The inner validator accepts a string id (normalized) or an object (a joined
  // entity on the serve path, pre-extraction). The `ZodOptional` return makes the schema field optional.
  const schema = z
    .custom<StoreKey<TEntity>>((v) => typeof v === "string" || (typeof v === "object" && v !== null))
    .optional();
  schema.register(relationRegistry, { model, kind: "single" });
  return schema as unknown as z.ZodOptional<z.ZodType<StoreKey<TEntity>, StoreKey<TEntity> | TInput>>;
}

/** Declare a to-many relation field inside a model schema (array of `ref`). Optional for the same reason. */
export function refArray<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): z.ZodOptional<z.ZodType<StoreKey<TEntity>[], (StoreKey<TEntity> | TInput)[]>> {
  const schema = z.custom<StoreKey<TEntity>[]>((v) => Array.isArray(v)).optional();
  schema.register(relationRegistry, { model, kind: "array" });
  return schema as unknown as z.ZodOptional<z.ZodType<StoreKey<TEntity>[], (StoreKey<TEntity> | TInput)[]>>;
}

function makeField<TShape, TInput>(
  kind: "single" | "array",
  model: ModelDescriptor<any, any>,
): FieldDescriptor<TShape, TInput> {
  const field = {
    kind,
    model,
    with: <TNext extends IncludeFor<TShape>>(include: TNext) =>
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
