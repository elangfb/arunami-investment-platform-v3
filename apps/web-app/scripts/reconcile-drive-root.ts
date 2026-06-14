// Ops sweep: reconcile the root "Mizan" Drive folder share (ADR-0019 §3 V1, see
// src/server/docs/root-share.ts). Four passes:
//   backfill  — per-email 'reader' grant on the root for every ADMITTED user (superadmin or ≥1
//               effective desk) that lacks one; rows marked 'invalid' are re-attempted here;
//   revoke    — grants whose email no longer maps to an admitted user are removed;
//   verify    — trust-but-verify against the live Drive permission list (re-grant ledgered readers
//               Drive dropped; flag unledgered live grants);
//   reparent  — legacy flat per-app Mizan-owned folders (Application.mizanDocFolderId created before
//               the root existed) are MOVED under the root.
//
// Exit code: 1 only on TRANSIENT failures (failed > 0 — rerun-worthy). Rows that fail PERMANENTLY
// ('invalid' — e.g. a non-Google email Drive refuses to share to) exit 0 with a warning: rerunning
// won't fix them, a human has to correct the address.
//
// Usage (root-share.ts imports 'server-only', so run with the test tsconfig — it aliases
// 'server-only' to a no-op stub so the server modules load under tsx):
//   TSX_TSCONFIG_PATH=apps/web-app/tsconfig.test.json \
//     pnpm --filter web-app exec tsx scripts/reconcile-drive-root.ts
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { reconcileRootShare } = await import('../src/server/docs/root-share')

const counts = await reconcileRootShare()
console.log(
  `root-share reconcile: granted=${counts.granted} skipped=${counts.skipped} ` +
    `revoked=${counts.revoked} regranted=${counts.regranted} unledgered=${counts.unledgered} ` +
    `reparented=${counts.reparented} invalid=${counts.invalid} failed=${counts.failed}`,
)
if (counts.invalid > 0) {
  console.warn(
    `WARNING: ${counts.invalid} grant(s) fail permanently (Drive refuses the sharee — likely a ` +
      `non-Google email). Rerunning will not fix these; correct the address(es). ` +
      `Rows: DriveRootGrant WHERE role = 'invalid'.`,
  )
}
if (counts.unledgered > 0) {
  console.warn(
    `WARNING: ${counts.unledgered} live root permission(s) have no DriveRootGrant ledger row ` +
      `(granted outside Mizan?). Flagged in logs by permission id — review and remove manually.`,
  )
}
// Explicit exit: the Prisma pg pool keeps the event loop alive otherwise. Exit 1 only on
// transient failures — 'invalid' rows alone are a warning, not a rerun signal.
process.exit(counts.failed > 0 ? 1 : 0)
