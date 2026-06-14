import 'server-only'
import { driveClient, docsClient } from '../google/clients'
import { withRetry } from '../retry'
import { buildMomFill, buildSp3Fill } from '@/lib/mom-sp3-tokens'
import { ensureMizanDocFolder, placeDocShortcut } from './mizan-drive'
import { log, errField } from '../log'
import type { LoanApplication } from '@/lib/types'

// MoM (committee minutes) + SP3 (offer letter) generation. Simpler than MUAP/RSK: a real-format
// template Doc carrying {{token}} literals for Mizan-known fields, filled one-way (Mizan → Doc) via
// replaceAllText, then handed to the maker (who fills the [human placeholders] and edits freely).
// No NamedRange setup, no AI/extraction. Templates are env-configured V3 masters de-customized from
// the real reference docs by scripts/author-momsp3-masters.ts. document-system.md §"Four documents".

export type MomSp3Which = 'mom' | 'sp3'

export interface MomSp3Opts {
  date?: string
  location?: string
  attendees?: string
  muapRef?: string
  rskRef?: string
  letterNo?: string
  address?: string
}

function templateId(which: MomSp3Which): string | undefined {
  return which === 'mom' ? process.env.GOOGLE_MOM_TEMPLATE_DOC_ID : process.env.GOOGLE_SP3_TEMPLATE_DOC_ID
}

/**
 * Generate a MoM or SP3 Doc for an application: copy the env-configured template, fill its {{token}}
 * literals one-way from buildMomFill/buildSp3Fill, and return the new Doc id. After the fill the Doc
 * belongs to the maker (one-way). Throws if the template id env is unset.
 */
export async function generateMomSp3Doc(
  app: LoanApplication,
  which: MomSp3Which,
  opts: MomSp3Opts = {},
): Promise<string> {
  const template = templateId(which)
  if (!template) throw new Error(`${which.toUpperCase()} template id env (GOOGLE_${which.toUpperCase()}_TEMPLATE_DOC_ID) is not set`)

  const drive = driveClient()
  const docs = docsClient()
  const label = app.namaUsaha?.trim() || app.nasabahName
  const name = `${which.toUpperCase()} — ${label} (${app.id})`

  // P4-C (ADR-0019 §4): land the MoM/SP3 copy under the Mizan-owned folder (parented), like MUAP/RSK.
  // Best-effort folder resolve — fall back to the account root on a Drive hiccup, never block generation.
  let parentFolderId: string | undefined
  try {
    parentFolderId = await ensureMizanDocFolder(app.id)
  } catch (e) {
    log.warn('docs.mizan_folder_failed', { applicationId: app.id, which, ...errField(e) })
  }

  const copy = await withRetry(
    () =>
      drive.files.copy({
        fileId: template,
        requestBody: parentFolderId ? { name, parents: [parentFolderId] } : { name },
        fields: 'id',
      }),
    { label: `drive.copy.${which}` },
  )
  const docId = copy.data.id
  if (!docId) throw new Error('Drive copy returned no id')

  const fill = which === 'mom' ? buildMomFill(app, opts) : buildSp3Fill(app, opts)
  const requests = Object.entries(fill).map(([token, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${token}}}`, matchCase: true },
      replaceText: value && value.trim() ? value : '—',
    },
  }))
  await withRetry(() => docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } }), {
    label: `docs.fill.${which}`,
  })
  // Drop a shortcut to the Mizan-owned doc into the user's app folder (if linked). Best-effort + retry-able.
  await placeDocShortcut(app.id, docId, name)
  return docId
}
