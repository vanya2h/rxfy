---
name: why-page-design
description: Design spec for the "Why rxfy?" documentation page — narrative arc from problem to principles
metadata:
  type: project
---

# Design: "Why rxfy?" page

## Goal

Add a `/why` page to the rxfy docs that answers the question developers ask before reading further: *why does this library exist, and why should I use it instead of something I already know?*

It is distinct from the existing `/comparison` page (which is a feature table + "when to reach for X" guide). This page earns the comparison by building from first principles.

## Approach

Narrative arc: open with the problem (reader recognition), reveal the insight (reader aha), close with named principles (reader trust). No code on this page — the API surface is covered everywhere else.

## Page structure

### 1. Title + one-liner

```
# Why rxfy?
```

A single framing sentence: rxfy exists because the common patterns for managing normalized server data leave you writing the same coordination glue over and over.

### 2. The problem

Concrete scenario: a list of entities (e.g. todos), and the moment one changes.

Three bad options developers reach for:
- **Refetch the list** — correct, but wastes a round-trip for data already in hand
- **Patch in-place** — works until a second component renders the same entity independently and diverges
- **Manual cache coordination** — invalidation, `setQueryData`, `staleTime`; large surface area, easy to get wrong

Then the SSR angle: server-rendered data needs to reach the client without a second fetch and without hydration mismatches. Every library handles this differently; most leave the wiring to you.

No code. The reader should feel the friction, not study an API.

### 3. The insight

One paragraph: these problems share a root cause — **the same entity living in more than one place**.

If every entity lives in exactly one slot, keyed by its id:
- A single write reaches every subscriber. No list refetch. No manual invalidation.
- Server and client share the same slot model. Hydration becomes a snapshot restore, not a coordination problem.

This is normalization — not as a data-fetching convention bolted on, but as the storage strategy the library is built around from the start.

### 4. The principles

Three named principles that follow from the insight:

1. **One entity, one place.** `createModel` declares the schema and id extractor. Every entity of that type lands in one `ModelStore` slot. A `store.set` is the only write path.

2. **Streams as delivery.** Each store slot is an RxJS `Observable`. Components subscribe directly to the entity they need. A write notifies exactly that slot's subscribers — nothing else re-runs.

3. **Declaration over wiring.** `defineState` bundles fetch params, model shape, mutations, and SSR snapshot into one declaration. You describe what the state is; rxfy handles normalization, caching, and hydration.

## Sidebar placement

Between "Introduction" and "Getting Started" in `vocs.config.tsx`:

```ts
{ text: "Why rxfy?", link: "/why" },
```

## Files to create / modify

| File | Change |
|---|---|
| `apps/docs/src/pages/why.mdx` | New page |
| `apps/docs/vocs.config.tsx` | Add sidebar entry after Introduction |

## Out of scope

- Code examples (this page is prose-only)
- Comparison table (already covered in `/comparison`)
- Installation or API reference
