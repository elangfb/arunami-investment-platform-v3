'use client'
import { useQueryState } from 'nuqs'
import { DetailCockpit } from '@/components/application/DetailCockpit'
import { DossierLayout } from '@/components/application/DossierLayout'
import { PipelineSpine } from '@/components/application/PipelineSpine'
import { useActor } from '@/context/ActorProvider'
import { defaultView, type DetailView } from '@/lib/detail-nav'
import { viewParser } from '@/lib/detail-query'
import type { LoanApplication } from '@/lib/types'
import { useState } from 'react'

// Client shell for the detail page. The RSC parent loads `initial` from the repo
// (DB-backed); this holds the working copy + view state. onUpdate(setApp) keeps
// the former in-memory update path — writes now return a fresh persisted aggregate.
//
// View state is driven by the URL ?view= param (via nuqs) so that:
//   - A valid deep-link ?view=<v> wins on first load.
//   - An invalid/missing ?view= falls back to the role/stage default from defaultView().
//   - Tab switches update the URL via replaceState (no history entry added).
export function DetailClient({ initial }: { initial: LoanApplication }) {
  const actor = useActor()
  const [app, setApp] = useState<LoanApplication>(initial)

  // urlView is null when the param is absent or not a valid DetailView value.
  // nuqs uses history:'replace' by default — matches the old history.replaceState behaviour.
  const [urlView, setUrlView] = useQueryState('view', viewParser)

  // Effective view: URL-specified (deep-link or user pick) wins; otherwise role/stage default.
  const view: DetailView = urlView ?? defaultView(actor, app)

  function changeView(v: DetailView) {
    void setUrlView(v)
  }

  return (
    <div className="space-y-4">
      <DetailCockpit app={app} onUpdate={setApp} onViewChange={changeView} />
      <PipelineSpine app={app} onViewChange={changeView} />
      <DossierLayout app={app} onUpdate={setApp} view={view} onViewChange={changeView} />
    </div>
  )
}
