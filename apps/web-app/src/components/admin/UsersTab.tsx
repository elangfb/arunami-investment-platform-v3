'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ADMIN_DESKS, DESK_CATALOG, type Desk } from '@/lib/desks'
import { grantDeskAction, grantRoleAction, revokeDeskAction, revokeRoleAction, setSuperadminAction } from '@/server/actions/admin'
import { impersonateAction } from '@/server/actions/impersonation'
import type { AdminRole, AdminUser, DeskCatalogRow } from '@/server/repo/users'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function UsersTab({
  users,
  roles,
  desks,
  currentUserId,
  isSuperadmin,
  onChanged,
}: {
  users: AdminUser[]
  roles: AdminRole[]
  desks: DeskCatalogRow[]
  currentUserId: string
  isSuperadmin: boolean
  onChanged: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null)

  const deskLabels = useMemo(() => {
    const labels = new Map<Desk, string>(DESK_CATALOG.map((entry) => [entry.desk, entry.label]))
    for (const entry of desks) labels.set(entry.desk, entry.label)
    return labels
  }, [desks])

  const runMutation = (mutation: () => Promise<void>) => {
    startTransition(() => {
      void (async () => {
        try {
          await mutation()
          onChanged()
        } catch (error) {
          toast.error((error as Error).message)
        }
      })()
    })
  }

  const deskLabel = (desk: Desk) => deskLabels.get(desk) ?? desk

  return (
    <div className="space-y-4">
      {users.map((user) => {
        const assignedRoleIds = new Set(user.roles.map((role) => role.id))
        const directDeskIds = new Set(user.directDesks)
        const availableRoles = roles.filter((role) => !assignedRoleIds.has(role.id))
        // Non-superadmin admins can't grant the ADMIN-* desks (server enforces; hide here too).
        const availableDesks = desks.filter(
          (entry) =>
            !directDeskIds.has(entry.desk) && (isSuperadmin || !(ADMIN_DESKS as string[]).includes(entry.desk)),
        )
        const cannotSelfDemote = user.id === currentUserId && user.isSuperadmin

        return (
          <Card key={user.id}>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {user.avatarInitials}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-base font-medium leading-tight">{user.name}</h3>
                      {user.isSuperadmin ? <Badge>Superadmin</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email ?? '—'}</p>
                    {user.title ? <p className="text-xs text-muted-foreground">{user.title}</p> : null}
                  </div>
                </div>
                {/* setSuperadmin + impersonation are break-glass → superadmin only (also
                    enforced server-side). Hidden for a delegated ADMIN-USERS admin. */}
                {isSuperadmin ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={user.isSuperadmin ? 'destructive' : 'outline'}
                      size="sm"
                      disabled={isPending || cannotSelfDemote}
                      onClick={() => setConfirmUser(user)}
                    >
                      {user.isSuperadmin ? 'Cabut Superadmin' : 'Jadikan Superadmin'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onClick={() => runMutation(() => impersonateAction(`user:${user.id}`))}
                    >
                      Bertindak sebagai
                    </Button>
                  </div>
                ) : null}
              </div>

              <AccessRow label="Peran">
                {user.roles.map((role) => (
                  <RemovableBadge
                    key={role.id}
                    label={role.name}
                    disabled={isPending}
                    onRemove={() => runMutation(() => revokeRoleAction(user.id, role.id))}
                  />
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" disabled={isPending} />}>
                    + Tambah peran
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {availableRoles.length ? (
                      availableRoles.map((role) => (
                        <DropdownMenuItem key={role.id} onClick={() => runMutation(() => grantRoleAction(user.id, role.id))}>
                          {role.name}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem disabled>Semua peran sudah diberikan</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </AccessRow>

              <AccessRow label="Desk pengecualian">
                {user.directDesks.map((desk) => (
                  <RemovableBadge
                    key={desk}
                    label={deskLabel(desk)}
                    disabled={isPending}
                    onRemove={() => runMutation(() => revokeDeskAction(user.id, desk))}
                  />
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" disabled={isPending} />}>
                    + Tambah desk
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64">
                    {availableDesks.length ? (
                      availableDesks.map((entry) => (
                        <DropdownMenuItem key={entry.desk} onClick={() => runMutation(() => grantDeskAction(user.id, entry.desk))}>
                          {deskLabel(entry.desk)}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem disabled>Semua desk sudah diberikan</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </AccessRow>

              <AccessRow label="Desk efektif">
                {user.desks.length ? (
                  user.desks.map((desk) => (
                    <Badge key={desk} variant="secondary">
                      {deskLabel(desk)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </AccessRow>
            </CardContent>
          </Card>
        )
      })}
      <ConfirmDialog
        open={confirmUser !== null}
        onOpenChange={(o) => { if (!o) setConfirmUser(null) }}
        title={confirmUser?.isSuperadmin ? 'Cabut akses Superadmin?' : 'Jadikan Superadmin?'}
        description={confirmUser ? (confirmUser.isSuperadmin
          ? `${confirmUser.name} akan kehilangan akses superadmin (konsol admin + impersonasi).`
          : `${confirmUser.name} akan mendapat akses superadmin penuh — konsol admin + impersonasi siapa pun. Beri hanya pada yang tepercaya.`) : undefined}
        confirmLabel={confirmUser?.isSuperadmin ? 'Cabut Superadmin' : 'Jadikan Superadmin'}
        destructive={!!confirmUser?.isSuperadmin}
        pending={isPending}
        onConfirm={() => { if (confirmUser) { runMutation(() => setSuperadminAction(confirmUser.id, !confirmUser.isSuperadmin)); setConfirmUser(null) } }}
      />
    </div>
  )
}

function AccessRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-start">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function RemovableBadge({
  label,
  disabled,
  onRemove,
}: {
  label: string
  disabled: boolean
  onRemove: () => void
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        className="rounded-full px-1 text-muted-foreground outline-none transition-colors hover:bg-background/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        aria-label={`Hapus ${label}`}
        onClick={onRemove}
      >
        ×
      </button>
    </Badge>
  )
}
