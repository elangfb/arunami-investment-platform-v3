import 'server-only'
import { docsClient } from '../google/clients'
import { withRetry } from '../retry'
import { qrImageUrl } from '@/lib/qr'

/**
 * Stamp a signature QR into a Doc at the END of a NamedRange (the signature slot, e.g. an RM/TL
 * `tanggal_ttd_*` (MUAP) and `rsk_sig_*` (RSK)). The image is the external QR-render API URL of the verify
 * page (document-system.md §Signing) — `insertInlineImage` cannot take base64, so Google fetches the
 * PNG once and stores its own copy. Returns false (no-op) when the NamedRange is absent from the Doc,
 * so a caller can safely best-effort it without knowing each template's exact slots.
 */
export async function stampSignatureQr(opts: {
  documentId: string
  namedRangeName: string
  token: string
  baseUrl: string
  sizePt?: number
}): Promise<boolean> {
  const docs = docsClient()
  const doc = await withRetry(
    () => docs.documents.get({ documentId: opts.documentId, fields: 'namedRanges' }),
    { label: 'docs.get.namedRanges' },
  )
  const range = doc.data.namedRanges?.[opts.namedRangeName]?.namedRanges?.[0]?.ranges?.[0]
  if (!range || range.endIndex == null) return false

  // Insert just inside the range end (endIndex is exclusive of the cell's trailing newline).
  const index = Math.max(1, range.endIndex - 1)
  const sizePt = opts.sizePt ?? 64
  await withRetry(
    () =>
      docs.documents.batchUpdate({
        documentId: opts.documentId,
        requestBody: {
          requests: [
            {
              insertInlineImage: {
                uri: qrImageUrl(opts.token, opts.baseUrl),
                location: { index },
                objectSize: {
                  height: { magnitude: sizePt, unit: 'PT' },
                  width: { magnitude: sizePt, unit: 'PT' },
                },
              },
            },
          ],
        },
      }),
    { label: 'docs.batchUpdate.qr' },
  )
  return true
}
