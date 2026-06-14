import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBureauSummaryPrompt, type BureauFacts } from './bureau-summary'
import { buildExtractPrompt } from '@/server/ai/extract-from-markdown-core'
import { renderContextCascade } from './ai-context-cascade'

// Injection contract (RM-led redesign §5 / Topic 5): a GROUNDED build*Prompt includes the layered
// cascade when one is supplied; the EXTRACT prompt CANNOT (it has no cascade param — pinned here so a
// future edit that tries to thread context into the transcriber fails to compile / is caught).

const CASCADE = renderContextCascade({ derived: 'D-FACTS', customerNote: 'C-NOTE', appNote: 'A-NOTE' })

function bureauFacts(): BureauFacts {
  return {
    nasabahName: 'Budi Santoso',
    kol: 1,
    dsr: 30,
    ltv: 50,
    plafond: 120_000_000,
    akad: 'Murabahah',
    hasSlik: true,
    hasPefindo: false,
    hasRekKoran: false,
    bureauTexts: [],
  }
}

test('grounded surface (bureau) prompt INCLUDES the injected cascade at the end', () => {
  const withCtx = buildBureauSummaryPrompt(bureauFacts(), CASCADE)
  assert.ok(withCtx.includes('Konteks Nasabah (AUTO)'), 'derived header present')
  assert.ok(withCtx.includes('C-NOTE') && withCtx.includes('A-NOTE'), 'human notes present')
  // appears after the bureau facts (end-of-prompt injection)
  assert.ok(withCtx.indexOf('Kolektibilitas') < withCtx.indexOf('Konteks Nasabah (AUTO)'), 'cascade after facts')
})

test('grounded surface (bureau) prompt UNCHANGED when no cascade supplied', () => {
  const noCtx = buildBureauSummaryPrompt(bureauFacts())
  assert.ok(!noCtx.includes('Konteks Nasabah'), 'no cascade markers')
  assert.ok(!noCtx.includes('KONTEKS TERSIMPAN'), 'no wrapper heading')
})

test('extract prompt does NOT and CANNOT carry the cascade (NON-NEGOTIABLE — no memory in extractor)', () => {
  const prompt = buildExtractPrompt('## MUAP\nisi muap', '## RSK\nisi rsk')
  assert.ok(!prompt.includes('KONTEKS TERSIMPAN'), 'no cascade wrapper')
  assert.ok(!prompt.includes('Catatan Nasabah'), 'no customer note')
  assert.ok(!prompt.includes('Catatan Pengajuan'), 'no app note')
  assert.ok(!prompt.includes('Konteks Nasabah (AUTO)'), 'no derived block')
  // buildExtractPrompt's arity is 2 (muap, rsk) — structurally no cascade channel exists.
  assert.equal(buildExtractPrompt.length, 2, 'extract builder takes ONLY the two doc markdowns')
})
