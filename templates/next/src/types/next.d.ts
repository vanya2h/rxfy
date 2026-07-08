// Provides Next.js global types to `tsc` before `next dev`/`next build` generates next-env.d.ts.
// Next manages next-env.d.ts (gitignored); this committed shim keeps `pnpm check-types` working
// on a fresh scaffold. Safe to delete once you have run the app once.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
