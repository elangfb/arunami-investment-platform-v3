'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { RiskPolicy } from '@/lib/hardGates'
import { createRiskPolicyVersionAction } from '@/server/actions/policy'
import type { RiskPolicyVersionRow } from '@/server/config/risk-policy'

// Policy (risk) tab — Phase C. Edits the OJK hard-gate thresholds: a save appends a NEW
// version (append-only audit). New thresholds apply live to in-flight apps; the version in
// effect at a committee decision is frozen into the DecisionCheckpoint audit record.
const FIELDS: { key: keyof RiskPolicy; label: string; hint: string; min: number; max: number }[] = [
  { key: 'dsrMaxPct', label: 'Batas DSR (%)', hint: 'DSR di atas nilai ini = gagal hard-gate', min: 1, max: 100 },
  { key: 'ltvMaxPct', label: 'Batas LTV (%)', hint: 'LTV di atas nilai ini = gagal hard-gate', min: 1, max: 100 },
  { key: 'kolMax', label: 'Batas Kolektibilitas', hint: 'Kol di atas nilai ini = gagal hard-gate', min: 1, max: 5 },
]

export function PolicyTab({
  policy,
  versions,
  onChanged,
}: {
  policy: RiskPolicy
  versions: RiskPolicyVersionRow[]
  onChanged: () => void
}) {
  const [draft, setDraft] = useState<Record<keyof RiskPolicy, string>>({
    dsrMaxPct: String(policy.dsrMaxPct),
    ltvMaxPct: String(policy.ltvMaxPct),
    kolMax: String(policy.kolMax),
  })
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const dirty = FIELDS.some((f) => Number(draft[f.key]) !== policy[f.key])

  function save() {
    const input = {
      dsrMaxPct: Number(draft.dsrMaxPct),
      ltvMaxPct: Number(draft.ltvMaxPct),
      kolMax: Number(draft.kolMax),
    }
    startTransition(async () => {
      try {
        await createRiskPolicyVersionAction(input, reason)
        setReason('')
        toast.success('Versi kebijakan risiko baru disimpan.')
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="font-heading text-lg font-semibold">Ambang hard-gate (OJK)</h3>
            <p className="text-sm text-muted-foreground">
              Menyimpan membuat versi baru (audit append-only). Berlaku langsung untuk aplikasi
              berjalan; versi saat keputusan komite dibekukan ke catatan keputusan.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{f.label}</span>
                <Input
                  type="number"
                  min={f.min}
                  max={f.max}
                  inputMode="numeric"
                  value={draft[f.key]}
                  disabled={isPending}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  aria-label={f.label}
                />
                <span className="text-xs text-muted-foreground">{f.hint}</span>
              </label>
            ))}
          </div>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan perubahan (opsional, masuk ke catatan audit)"
            aria-label="Alasan perubahan"
            disabled={isPending}
          />
          <Button type="button" onClick={save} disabled={!dirty || isPending}>
            Simpan versi baru
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">Riwayat versi</h3>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada versi.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.version} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      berlaku {v.effectiveFrom.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-muted-foreground">· oleh {v.createdBy}</span>
                  </div>
                  <div className="tabular mt-1 text-muted-foreground">
                    DSR&gt;{v.dsrMaxPct}% · LTV&gt;{v.ltvMaxPct}% · Kol&gt;{v.kolMax}
                  </div>
                  {v.reason ? <div className="mt-1 italic text-muted-foreground">“{v.reason}”</div> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
