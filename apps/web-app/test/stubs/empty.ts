// Test stub for `server-only` / `client-only`. Those packages throw on import outside
// the RSC/bundler boundary (by design), which blocks unit-testing server modules under
// tsx. The test tsconfig aliases them here so repo/serialize/etc. are importable in tests.
export {}
