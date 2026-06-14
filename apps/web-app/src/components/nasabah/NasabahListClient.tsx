'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, PlusCircle, User, UsersRound } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import type { CustomerListRow } from '@/server/repo/customer'

const displayName = (c: CustomerListRow) => (c.nama || c.namaUsaha || c.id).trim()

// Identity key surfaced per type: NIK for an individual, NPWP for a business.
const identityKey = (c: CustomerListRow) =>
  c.type === 'individual' ? c.nik : c.npwp

function NasabahCard({ customer }: { customer: CustomerListRow }) {
  const isBusiness = customer.type === 'business'
  const Icon = isBusiness ? Building2 : User
  const key = identityKey(customer)
  return (
    <Link href={`/nasabah/${customer.id}`} className="block">
      <Card
        size="sm"
        className="gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/40 hover:shadow-[var(--shadow-card-hover)]"
      >
        <CardContent className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate font-semibold leading-snug">{displayName(customer)}</span>
            </div>
            <Badge variant="outline" className="w-fit shrink-0">
              {isBusiness ? 'Bisnis' : 'Individu'}
            </Badge>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="truncate">
              {key ? (
                <span className="font-mono">{key}</span>
              ) : (
                <span className="italic">Identitas belum lengkap</span>
              )}
            </span>
            <span className="shrink-0">{customer.applicationCount} pengajuan</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export function NasabahListClient({ customers }: { customers: CustomerListRow[] }) {
  const actor = useActor()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (query.length === 0) return customers
    return customers.filter((c) =>
      [c.nama, c.namaUsaha, c.nik, c.npwp].some(
        (field) => field != null && field.toLowerCase().includes(query),
      ),
    )
  }, [customers, searchQuery])

  return (
    <Page.Root>
      <Page.Header
        title="Nasabah"
        description="Semua nasabah yang terdaftar di Mizan beserta riwayat pengajuannya."
      >
        {hasDesk(actor, 'intake') && (
          <Link href="/applications/new">
            <Button><PlusCircle className="mr-2 size-4" />Pengajuan Baru</Button>
          </Link>
        )}
      </Page.Header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Cari nama, NIK, atau NPWP..."
          className="w-full sm:w-[320px]"
        />
      </div>

      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCustomers.map((customer) => (
          <NasabahCard key={customer.id} customer={customer} />
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <EmptyState
          icon={UsersRound}
          title="Tidak ada nasabah"
          description="Tidak ada nasabah yang cocok dengan pencarian."
        />
      )}
    </Page.Root>
  )
}
