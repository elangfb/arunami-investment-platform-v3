// Layered AI context — the PURE cascade renderer + layer assembler (RM-led redesign §5 / Topic 5).
//
// Two human-context tracks, presented as one compact context modeled on AGENTS.md (cascade by
// scope, broad → narrow):
//   • Customer.contextMd  — Nasabah-scoped "Catatan" (≈ root AGENTS.md).
//   • Application.contextMd — app-scoped "Catatan" (≈ app-local AGENTS.md).
// Plus a DERIVED "AUTO" block — app facts + prior-deal carry-forward, regenerated live, never stored.
//
// This module is PURE (no server-only / no prisma) so the rendering contract is hermetically
// unit-tested (ai-context-cascade.test.ts). The DB read (customer + prior apps) lives in a THIN
// SERVER WRAPPER (server/ai/context-layers.ts) that calls buildAiContextLayers with already-loaded
// data. Per-surface gating is decided by lib/ai-context-policy.ts; the injection sites append the
// rendered cascade at the END of the user prompt (before maskForEgress).

import { buildSeedContext } from './seed-context'
import { formatRupiah } from './sla-utils'
import type { LoanApplication } from './types'

/** The three assembled layers, pre-render. Any layer may be empty/absent → omitted by the renderer. */
export interface ContextLayers {
  /** The AUTO derived block (app facts + prior-deal outcomes). Regenerated live; never hand-edited. */
  derived?: string
  /** Customer-scoped human "Catatan" (Customer.contextMd) — free-text, additive. */
  customerNote?: string | null
  /** App-scoped human "Catatan" (Application.contextMd) — free-text, additive. */
  appNote?: string | null
}

// Section headers — stable, decodeable labels (a less-capable reader must know what each block is).
const H_DERIVED = 'Konteks Nasabah (AUTO)'
const H_CUSTOMER = 'Catatan Nasabah'
const H_APP = 'Catatan Pengajuan'

/**
 * Render the layered context as a COMPACT markdown block, AGENTS.md-style, broad → narrow
 * (customer context before app context). Empty/blank layers are OMITTED. Returns '' when every
 * layer is empty — so a caller can cheaply skip injection. PURE (string → string).
 */
export function renderContextCascade(layers: ContextLayers): string {
  const blocks: string[] = []
  const push = (header: string, body: string | null | undefined) => {
    const text = body?.trim()
    if (text) blocks.push(`### ${header}\n${text}`)
  }
  // broad → narrow: derived (auto app facts) → customer "Catatan" → app "Catatan".
  push(H_DERIVED, layers.derived)
  push(H_CUSTOMER, layers.customerNote)
  push(H_APP, layers.appNote)
  if (!blocks.length) return ''
  return ['## KONTEKS TERSIMPAN (rujukan; bukan angka/keputusan resmi)', ...blocks].join('\n\n')
}

/** A prior application, condensed for the carry-forward line. Structural (lib stays pure). */
export interface PriorAppSummary {
  id: string
  akadType: string
  requestedPlafond: number
  komiteDecision?: string | null
  applicationStatus?: string | null
}

// One compact line per prior deal: facility + outcome. Carry-forward context for the current deal
// (decided 2026: prior Mizan outcomes inform the new underwrite). Drops the current app itself.
function priorAppsLine(priorApps: PriorAppSummary[], currentAppId: string): string | undefined {
  const prior = priorApps.filter((a) => a.id !== currentAppId)
  if (!prior.length) return undefined
  const items = prior.map((a) => {
    const outcome = a.komiteDecision
      ? `keputusan ${a.komiteDecision}`
      : a.applicationStatus === 'closed'
        ? 'ditutup'
        : 'berjalan'
    return `- ${a.id}: ${a.akadType} ${formatRupiah(a.requestedPlafond)} — ${outcome}`
  })
  return ['Riwayat fasilitas nasabah (carry-forward):', ...items].join('\n')
}

// originType task-framing: a review/adendum is a re-underwrite of an existing facility → tell the
// model to compare against current policy; an original is a fresh intake. Absent/null = original.
function originFramingLine(originType: LoanApplication['originType']): string {
  return originType === 'review' || originType === 'adendum'
    ? `Jenis: ${originType} dari fasilitas sebelumnya — bandingkan dengan ketentuan terkini.`
    : 'Jenis: pengajuan baru.'
}

/**
 * Assemble the three context layers for an application. The DERIVED (AUTO) block reuses the existing
 * compact app summary (buildSeedContext) + an origin task-framing line + a compact prior-deals line
 * (carry-forward); customerNote/appNote carry the human "Catatan" verbatim. PURE — the caller (the
 * thin server wrapper) supplies the loaded customer note + prior apps from getCustomerWithApplications.
 *
 * The returned layers are RENDERED by renderContextCascade and GATED per surface by contextPolicyFor.
 */
export function buildAiContextLayers(
  app: LoanApplication,
  customerNote?: string | null,
  priorApps: PriorAppSummary[] = [],
): ContextLayers {
  const seed = buildSeedContext(app)
  const derivedLines = [
    originFramingLine(app.originType),
    `Nasabah: ${seed.namaUsaha || seed.nasabahName} (${seed.nasabahType})`,
    `Akad: ${seed.akadType}; Plafond: ${formatRupiah(seed.requestedPlafond)}; Tenor: ${seed.requestedTenorMonths} bulan`,
    `Tujuan: ${seed.purpose}`,
    `Hard gate: DSR ${seed.hardGates.dsr}%, LTV ${seed.hardGates.ltv}%, Kol ${seed.hardGates.kol}`,
  ]
  const prior = priorAppsLine(priorApps, app.id)
  if (prior) derivedLines.push('', prior)
  return {
    derived: derivedLines.join('\n'),
    customerNote: customerNote ?? null,
    appNote: app.contextMd ?? null,
  }
}

/**
 * Convenience: build the gated cascade string for a surface in one call (layers → policy → render).
 * Returns '' when the surface gets nothing (extract) or every granted layer is empty. The injection
 * sites append the result to the END of the user prompt (before maskForEgress).
 */
export function renderCascadeForPolicy(layers: ContextLayers, policy: { derived: boolean; customer: boolean; app: boolean }): string {
  return renderContextCascade({
    derived: policy.derived ? layers.derived : undefined,
    customerNote: policy.customer ? layers.customerNote : undefined,
    appNote: policy.app ? layers.appNote : undefined,
  })
}

/**
 * Render ONLY the AUTO derived block for an application, for the READ-ONLY "konteks otomatis" preview
 * in the contextMd editors (so the human sees what the AI already derives and does not re-type it).
 * PURE + client-safe (no DB) — it omits the prior-deal carry-forward line, which needs a server read;
 * the full carry-forward is assembled at injection time by the server wrapper. Returns '' when there
 * are no derived facts (defensive — buildSeedContext always yields some, so this is effectively
 * non-empty for a real app).
 */
export function renderDerivedPreview(app: LoanApplication): string {
  return renderContextCascade({ derived: buildAiContextLayers(app).derived })
}
