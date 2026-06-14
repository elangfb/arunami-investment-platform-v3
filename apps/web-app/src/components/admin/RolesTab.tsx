'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ADMIN_DESKS, DESK_CATALOG } from '@/lib/desks'
import {
  createRoleAction,
  deleteRoleAction,
  updateRoleDesksAction,
} from '@/server/actions/admin'
import type { AdminRole, DeskCatalogRow } from '@/server/repo/users'

export function RolesTab({ roles, desks, isSuperadmin, onChanged }: {
  roles: AdminRole[]
  desks: DeskCatalogRow[]
  isSuperadmin: boolean
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [selectedDesks, setSelectedDesks] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [confirmRole, setConfirmRole] = useState<AdminRole | null>(null)

  const deskLabelById = new Map(desks.map((desk) => [desk.desk, desk.label]))
  // Only superadmin may put ADMIN-* desks into a role bundle (server enforces; hide here too).
  const catalog = DESK_CATALOG.filter(
    (desk) => isSuperadmin || !(ADMIN_DESKS as string[]).includes(desk.desk),
  ).map((desk) => ({
    desk: desk.desk,
    label: deskLabelById.get(desk.desk) ?? desk.label,
  }))

  function toggleSelectedDesk(desk: string) {
    setSelectedDesks((current) => {
      const next = new Set(current)
      if (next.has(desk)) {
        next.delete(desk)
      } else {
        next.add(desk)
      }
      return next
    })
  }

  function createRole() {
    startTransition(async () => {
      try {
        await createRoleAction(name.trim(), [...selectedDesks])
        setName('')
        setSelectedDesks(new Set())
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function updateRoleDesk(role: AdminRole, desk: string) {
    const currentDesks = new Set<string>(role.desks)
    if (currentDesks.has(desk)) {
      currentDesks.delete(desk)
    } else {
      currentDesks.add(desk)
    }

    startTransition(async () => {
      try {
        await updateRoleDesksAction(role.id, [...currentDesks])
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function deleteRole(roleId: string) {
    startTransition(async () => {
      try {
        await deleteRoleAction(roleId)
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
            <h3 className="font-heading text-lg font-semibold">Buat peran baru</h3>
            <p className="text-sm text-muted-foreground">Pilih desk yang akan diberikan ke peran ini.</p>
          </div>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama peran"
            aria-label="Nama peran"
          />
          <div className="flex flex-wrap gap-2">
            {catalog.map((desk) => {
              const active = selectedDesks.has(desk.desk)
              return (
                <Button
                  key={desk.desk}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => toggleSelectedDesk(desk.desk)}
                  disabled={isPending}
                >
                  {desk.label}
                </Button>
              )
            })}
          </div>
          <Button type="button" onClick={createRole} disabled={name.trim().length === 0 || isPending}>
            Buat
          </Button>
        </CardContent>
      </Card>

      {roles.map((role) => (
        <Card key={role.id}>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-lg font-semibold">{role.name}</h3>
                  {role.isSystem && <Badge variant="outline">Sistem</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{role.userCount} pengguna</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmRole(role)}
                disabled={role.isSystem || isPending}
              >
                Hapus
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {catalog.map((desk) => {
                const active = role.desks.includes(desk.desk)
                return (
                  <Button
                    key={desk.desk}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    onClick={() => updateRoleDesk(role, desk.desk)}
                    disabled={isPending}
                  >
                    {desk.label}
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
      <ConfirmDialog
        open={confirmRole !== null}
        onOpenChange={(o) => { if (!o) setConfirmRole(null) }}
        title="Hapus peran ini?"
        description={confirmRole ? `Peran "${confirmRole.name}" (${confirmRole.userCount} pengguna) akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.` : undefined}
        confirmLabel="Hapus peran"
        pending={isPending}
        onConfirm={() => { if (confirmRole) { deleteRole(confirmRole.id); setConfirmRole(null) } }}
      />
    </div>
  )
}
