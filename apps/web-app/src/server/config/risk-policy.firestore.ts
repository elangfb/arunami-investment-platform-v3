import 'server-only'
import type { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import type { RiskPolicyRow, RiskPolicyVersionRow } from './risk-policy'

// Firestore fetch sibling for the risk-policy config (config_riskPolicy/{version}). MUST toDate()
// effectiveFrom/createdAt before returning — resolveActiveVersion compares .getTime() (critique #8);
// the RiskPolicyRow type fixes effectiveFrom:Date so a forgotten conversion is a compile error.

export async function fetchRiskPolicyRows(): Promise<RiskPolicyRow[]> {
  const snap = await getDb().collection(COL.config_riskPolicy).get()
  return snap.docs.map((s) => {
    const d = s.data()
    return {
      version: d.version as number,
      effectiveFrom: toDate(d.effectiveFrom as Timestamp),
      dsrMaxPct: d.dsrMaxPct as number,
      ltvMaxPct: d.ltvMaxPct as number,
      kolMax: d.kolMax as number,
    }
  })
}

export async function fetchRiskPolicyVersionRows(): Promise<RiskPolicyVersionRow[]> {
  const snap = await getDb().collection(COL.config_riskPolicy).orderBy('version', 'desc').get()
  return snap.docs.map((s) => {
    const d = s.data()
    return {
      version: d.version as number,
      dsrMaxPct: d.dsrMaxPct as number,
      ltvMaxPct: d.ltvMaxPct as number,
      kolMax: d.kolMax as number,
      effectiveFrom: toDate(d.effectiveFrom as Timestamp),
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: toDate(d.createdAt as Timestamp),
    }
  })
}
