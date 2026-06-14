'use client'

import { useState, useTransition, useMemo } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { chainRoles, type ApprovalChain, type ApprovalRole } from '@/lib/approval-chain'
import { APPROVAL_ROLE_LABEL } from '@/lib/approval-desks'
import { createApprovalRoutingRuleAction } from '@/server/actions/routing'
import type { ApprovalRoutingRuleRow } from '@/server/config/approval-routing'
import type { AdminUser } from '@/server/repo/users'

export function RoutingTab({
  rules,
  users,
  onChanged,
}: {
  rules: ApprovalRoutingRuleRow[]
  users: AdminUser[]
  onChanged: () => void
}) {
  const [makerUserId, setMakerUserId] = useState('')
  const [chain, setChain] = useState<ApprovalChain | ''>('')
  const [routing, setRouting] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])

  const checkerRungs: ApprovalRole[] = chain ? chainRoles(chain).slice(1) : []

  const makerItems = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  )
  const chainItems: Record<string, string> = { muap: 'MUAP', rsk: 'RSK' }
  const approverItems = useMemo(
    () => ({ '': '— (tidak dikonfigurasi)', ...Object.fromEntries(users.map((u) => [u.id, u.name])) }),
    [users],
  )

  function handleChainChange(value: string | null) {
    setChain((value ?? '') as ApprovalChain | '')
    setRouting({})
  }

  function handleRungChange(role: ApprovalRole, value: string) {
    setRouting((prev) => {
      const next = { ...prev }
      if (value) {
        next[role] = value
      } else {
        delete next[role]
      }
      return next
    })
  }

  function handleSubmit() {
    if (!makerUserId) { toast.error('Pilih pembuat (maker) yang dirutekan.'); return }
    if (!chain) { toast.error('Pilih rantai persetujuan.'); return }
    startTransition(async () => {
      try {
        await createApprovalRoutingRuleAction(
          { makerUserId, chain, routing },
          reason.trim() || undefined,
        )
        setMakerUserId('')
        setChain('')
        setRouting({})
        setReason('')
        toast.success('Aturan routing persetujuan baru disimpan.')
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
            <h3 className="font-heading text-lg font-semibold">Tambah Aturan Routing</h3>
            <p className="text-sm text-muted-foreground">
              Tetapkan akun penandatangan spesifik per rung checker untuk satu pembuat dan rantai.
              Append-only — setiap penyimpanan membuat versi baru. Rungs yang dikosongkan tidak
              dikonfigurasi (fallback ke semua pemegang desk).
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Pembuat (Maker)</span>
              <Select
                value={makerUserId}
                onValueChange={(v) => setMakerUserId(v ?? '')}
                items={makerItems}
              >
                <SelectTrigger disabled={isPending}>
                  <SelectValue placeholder="Pilih pengguna pembuat" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Rantai Persetujuan</span>
              <Select
                value={chain}
                onValueChange={handleChainChange}
                items={chainItems}
              >
                <SelectTrigger disabled={isPending}>
                  <SelectValue placeholder="Pilih rantai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="muap">MUAP</SelectItem>
                  <SelectItem value="rsk">RSK</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {checkerRungs.length > 0 ? (
            <div className="space-y-2">
              <span className="text-sm font-medium">Penandatangan per Rung</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {checkerRungs.map((role) => (
                  <div key={role} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{APPROVAL_ROLE_LABEL[role]}</span>
                    <Select
                      value={routing[role] ?? ''}
                      onValueChange={(v) => handleRungChange(role, v ?? '')}
                      items={approverItems}
                    >
                      <SelectTrigger disabled={isPending}>
                        <SelectValue placeholder="— (tidak dikonfigurasi)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— (tidak dikonfigurasi)</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Alasan <span className="font-normal text-muted-foreground">(opsional)</span></span>
            <textarea
              className="min-h-[3rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Alasan perubahan routing (masuk ke catatan audit)"
              disabled={isPending}
              rows={2}
            />
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!makerUserId || !chain || isPending}
          >
            Simpan aturan routing baru
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">Riwayat aturan routing</h3>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada aturan routing.</p>
          ) : (
            <ul className="space-y-2">
              {rules.map((r, i) => {
                const makerName = userById.get(r.makerUserId) ?? r.makerUserId
                const createdByName = userById.get(r.createdBy) ?? r.createdBy
                const rungs = chainRoles(r.chain).slice(1) as ApprovalRole[]
                return (
                  <li key={`${r.makerUserId}-${r.chain}-${r.version}-${i}`} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">v{r.version}</Badge>
                      <Badge variant={r.chain === 'muap' ? 'default' : 'outline'}>
                        {r.chain === 'muap' ? 'MUAP' : 'RSK'}
                      </Badge>
                      <span className="font-medium">{makerName}</span>
                      <span className="text-muted-foreground">
                        berlaku{' '}
                        {r.effectiveFrom.toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-muted-foreground">· oleh {createdByName}</span>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {rungs.map((role) => {
                        const approverId = r.routing[role]
                        return (
                          <div key={role} className="text-muted-foreground">
                            <span className="text-foreground">{APPROVAL_ROLE_LABEL[role]}:</span>{' '}
                            {approverId ? (userById.get(approverId) ?? approverId) : '—'}
                          </div>
                        )
                      })}
                    </div>
                    {r.reason ? (
                      <div className="mt-1 italic text-muted-foreground">{`"${r.reason}"`}</div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
