'use server'

import { requireActor } from '@/server/auth/session'
import { AuthzError, hasAnyDesk } from '@/lib/auth/can'
import { loadApplicationForWrite } from '@/server/repo/write'
import { generateMomSp3Doc, type MomSp3Opts, type MomSp3Which } from '@/server/docs/mom-sp3'
import { grantDocAccessForActor } from '@/server/docs/access'
import { updateDocLinkage } from '@/server/repo/doc-linkage'
import { log, errField } from '@/server/log'
import type { Desk } from '@/lib/desks'

// MoM (committee minutes) + SP3 (offer letter) generation actions. RM-invoked per the design
// (ai-assist.md §"Document creation triggers"): MoM by committee/RM, SP3 by RM post-decision. The
// generated Doc id is stored on DocLinkage (best-effort) so the UI can link to it; the Doc itself is
// the source of truth and belongs to the maker after generation (one-way).

async function generate(
  appId: string,
  which: MomSp3Which,
  gateDesks: Desk[],
  opts: MomSp3Opts,
): Promise<{ docId: string; url: string }> {
  const actor = await requireActor()
  if (!hasAnyDesk(actor, ...gateDesks)) {
    throw new AuthzError(`Anda tidak berwenang membuat dokumen ${which.toUpperCase()}.`)
  }
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)

  const docId = await generateMomSp3Doc(app, which, opts)

  // The Doc is owned by the dedicated Mizan account and starts private, so the generator (a different
  // Google identity) would hit the request-access wall on the /edit link we open below. Grant them
  // WRITER just-in-time. Other staff get reader on later visits via ensureDocAccessForActor.
  await grantDocAccessForActor(actor, appId, docId, 'writer')

  // Best-effort: link the generated Doc on the application's linkage row (if one exists). A failure
  // never loses the Doc — the id/url is returned to the caller regardless.
  try {
    await updateDocLinkage(appId, which === 'mom' ? { momDocId: docId } : { sp3DocId: docId })
  } catch (e) {
    log.error('momsp3.link_failed', { appId, which, docId, ...errField(e) })
  }
  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` }
}

/** Generate the committee Minutes of Meeting (MoM) for an application. Committee or RM desks. */
export async function generateMomAction(
  appId: string,
  opts: MomSp3Opts = {},
): Promise<{ docId: string; url: string }> {
  return generate(appId, 'mom', ['komite', 'intake', 'pencairan'], opts)
}

/** Generate the offer letter (SP3) for an approved application. RM desks. */
export async function generateSp3Action(
  appId: string,
  opts: MomSp3Opts = {},
): Promise<{ docId: string; url: string }> {
  return generate(appId, 'sp3', ['intake', 'pencairan'], opts)
}
