// Reusable extraction entry point: fetch an application's MUAP + RSK Docs and run
// the pure engine over them. Called by the extract API route (and the verify script).

import { docsClient } from '../clients'
import { withRetry } from '../../retry'
import { makeResolver } from './resolver'
import { readRacDeviations } from './rac'
import { extract, type ExtractOptions } from '../../../lib/extraction/extract'
import type { ExtractionResult } from '../../../lib/extraction/types'

export async function extractApplicationDocs(
  muapDocId: string,
  rskDocId: string | null, // Batch 3 T3: RSK may not exist yet (created at Stage-4 entry) → MUAP-only read-back
  opts?: ExtractOptions,
): Promise<ExtractionResult> {
  const docs = docsClient()
  const [muap, rsk] = await Promise.all([
    withRetry(() => docs.documents.get({ documentId: muapDocId }), { label: 'docs.get.muap' }),
    rskDocId ? withRetry(() => docs.documents.get({ documentId: rskDocId }), { label: 'docs.get.rsk' }) : Promise.resolve(null),
  ])
  const rskData = rsk?.data ?? {} // empty resolver → no RSK fields found (the doc isn't created yet)
  const result = extract({ muap: makeResolver(muap.data), rsk: makeResolver(rskData) }, opts)
  // RAC deviations are read structurally from the RSK table (not a marker).
  if (result.snapshot) result.snapshot.racDeviations = readRacDeviations(rskData)
  return result
}
