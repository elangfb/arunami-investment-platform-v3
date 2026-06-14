// Shared enable-guard for the e2e test-fixture routes (/api/test-fixture, /api/test-fixture/meeting,
// /api/test-fixture/login). TWO factors, BOTH required:
//   1. E2E_MODE=1, and
//   2. a THROWAWAY backend — the *_e2e Postgres DB (prisma mode, DATABASE_URL ⊃ 'mizan_e2e') OR the
//      Firestore emulator (firestore mode, FIRESTORE_EMULATOR_HOST set).
// Neither factor is ever present in production, so these routes — which BYPASS desk gating + actor
// identity and dispatch through the REAL write seam — can never open against real data, even after the
// Firestore cutover makes firestore the production backend. Single audited guard so the three fixture
// routes cannot drift apart.
export function e2eFixturesEnabled(): boolean {
  if (process.env.E2E_MODE !== '1') return false
  return (process.env.DATABASE_URL ?? '').includes('mizan_e2e') || !!process.env.FIRESTORE_EMULATOR_HOST
}
