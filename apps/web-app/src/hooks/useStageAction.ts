'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useActor } from '@/context/ActorProvider'
import { actingRolesForStage } from '@/lib/auth/can'
import { type TransitionConfig } from '@/lib/stage-action'
import {
  transitionAction,
  saveRiskRecommendationAction,
  completeLegalAction,
  completeSlikAction,
} from '@/server/actions/application-stage'
import type { LoanApplication, RiskRecommendation } from '@/lib/types'

export function useStageAction(app: LoanApplication, onUpdate: (a: LoanApplication) => void) {
  const actor = useActor()
  // Every pipeline role the actor can act as at the current stage (a multi-desk actor —
  // e.g. Legal + RM bureau-data at stage 2 — gets one task card per hat). Empty → read-only band.
  const roles = actingRolesForStage(actor, app)
  const [transition, setTransition] = useState<TransitionConfig | null>(null)
  const [riskRecommendation, setRiskRecommendation] = useState<Exclude<RiskRecommendation, null>>('approve')
  const [riskNote, setRiskNote] = useState('')
  const [legalNotes, setLegalNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  // Identity is now read from the verified session inside each action — never passed
  // from the client.

  function confirmTransition(reason?: string) {
    if (!transition) return
    const t = transition
    startTransition(async () => {
      try {
        const { app: fresh, autoSkipped } = await transitionAction(app.id, t, reason)
        if (autoSkipped) toast('Aplikasi lanjut ke Review Kelayakan.')
        onUpdate(fresh)
        setTransition(null)
      } catch (e) {
        toast.error('Gagal menyimpan perubahan. Coba lagi.')
        console.error(e)
      }
    })
  }

  function saveRiskRecommendation() {
    startTransition(async () => {
      try {
        onUpdate(await saveRiskRecommendationAction(app.id, riskRecommendation, riskNote))
      } catch (e) {
        toast.error('Gagal menyimpan rekomendasi risiko. Coba lagi.')
        console.error(e)
      }
    })
  }

  function saveLegalApproval() {
    startTransition(async () => {
      try {
        // Legacy caller path retained for safety; the active UI records Analisa Yuridis on
        // DocumentsTab. This action no longer advances 2→3 — RM bureau-data handoff owns that.
        // P3-D §4: the structured `opinion` defaults to 'layak' in the action when omitted; the
        // opinion picker UI lands in a later UI batch. Here we pass the legacy free-text `notes` only.
        const { app: fresh } = await completeLegalAction(app.id, { notes: legalNotes })
        onUpdate(fresh)
      } catch (e) {
        toast.error('Gagal menyimpan Analisa Yuridis. Coba lagi.')
        console.error(e)
      }
    })
  }

  function completeSlik() {
    startTransition(async () => {
      try {
        const { app: fresh, autoSkipped } = await completeSlikAction(app.id)
        if (autoSkipped) toast('Data biro lengkap — aplikasi lanjut ke Review Kelayakan.')
        onUpdate(fresh)
      } catch (e) {
        toast.error('Gagal mengirim SLIK ke Feasibility. Coba lagi.')
        console.error(e)
      }
    })
  }

  return {
    roles,
    isPending,
    transition,
    openTransition: setTransition,
    closeTransition: () => setTransition(null),
    confirmTransition,
    riskRecommendation,
    setRiskRecommendation,
    riskNote,
    setRiskNote,
    legalNotes,
    setLegalNotes,
    saveRiskRecommendation,
    saveLegalApproval,
    completeSlik,
  }
}
