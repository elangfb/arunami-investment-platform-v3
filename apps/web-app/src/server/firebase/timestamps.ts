import 'server-only'
import { Timestamp } from 'firebase-admin/firestore'

// Firestore stores dates as Timestamp; the domain (LoanApplication, etc.) uses JS Date. Convert at
// EVERY top-level date field on read (toDate) and write (tsFromDate). LOAD-BEARING: resolveActiveVersion
// and the serialize mapper compare/emit Date — a missed conversion silently corrupts (NaN compares,
// wrong RSC serialization). DO NOT convert ISO-string timestamps EMBEDDED inside JSON aggregates
// (amlAttestation.attestedAt, reassignmentLog[].at, exploredSources[].retrievedAt, …) — those stay strings.

export function toDate(v: Timestamp | Date): Date
export function toDate(v: Timestamp | Date | null): Date | null
export function toDate(v: Timestamp | Date | null | undefined): Date | null | undefined
export function toDate(v: Timestamp | Date | null | undefined): Date | null | undefined {
  if (v == null) return v
  return v instanceof Timestamp ? v.toDate() : v
}

export function tsFromDate(d: Date): Timestamp
export function tsFromDate(d: Date | null): Timestamp | null
export function tsFromDate(d: Date | null | undefined): Timestamp | null | undefined
export function tsFromDate(d: Date | null | undefined): Timestamp | null | undefined {
  if (d == null) return d
  return Timestamp.fromDate(d)
}
