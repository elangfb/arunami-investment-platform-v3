// Pure resolver for append-only, effective-dated versioned config (configurability-and-admin.md).
// The active version at instant `at` = the highest `version` whose `effectiveFrom <= at`.
// Future-dated versions (effectiveFrom > at) are ignored, so an admin can stage a change ahead
// of time. Pure + dependency-free so every config type (SLA, rates, risk policy) shares one
// tested rule; the DB read lives in the server/config/* modules that call this.

export interface VersionedRow {
  version: number
  effectiveFrom: Date
}

/** The version in effect at `at` (default now), or undefined if none is yet effective. */
export function resolveActiveVersion<T extends VersionedRow>(rows: readonly T[], at: Date = new Date()): T | undefined {
  let active: T | undefined
  for (const row of rows) {
    if (row.effectiveFrom.getTime() > at.getTime()) continue // not yet effective
    if (!active || row.version > active.version) active = row
  }
  return active
}
