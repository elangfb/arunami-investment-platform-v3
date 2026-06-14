'use server'

import { requireActor } from '@/server/auth/session'
import { findCustomerDedupMatches, type CustomerDedupMatch } from '@/server/repo/customer'

/// Create-time dedup nudge probe (ADR-0020 §2 customer-first). Called from the client create form on
/// identity-field change to surface existing Customer files that share the identity key. READ is open
/// to any authenticated actor — only requireActor(), NO desk assert (mirrors the open Nasabah read;
/// CREATE stays intake-gated in createApplicationAction). Returns the enriched matches (possibly
/// empty); the UI decides whether to nudge. No new dedup logic — delegates to findCustomerDedupMatches.
export async function checkCustomerDedupAction(query: {
  type: 'individual' | 'business'
  nik?: string
  npwp?: string
  nib?: string
}): Promise<CustomerDedupMatch[]> {
  await requireActor()
  return findCustomerDedupMatches(query)
}
