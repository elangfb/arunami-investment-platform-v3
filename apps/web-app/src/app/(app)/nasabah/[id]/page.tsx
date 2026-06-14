import { UserX } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { EmptyState } from '@/components/ui/empty-state'
import { NasabahDetailClient } from '@/components/nasabah/NasabahDetailClient'
import { getCustomerWithApplications } from '@/server/repo/customer'

export default async function NasabahDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getCustomerWithApplications(id)

  if (!result) {
    return (
      <Page.Root>
        <Page.Header eyebrow="Nasabah" title="Nasabah tidak ditemukan" />
        <EmptyState
          icon={UserX}
          title="Nasabah tidak ditemukan"
          description="Data nasabah dengan tautan ini tidak tersedia atau telah dihapus."
        />
      </Page.Root>
    )
  }

  return <NasabahDetailClient customer={result.customer} applications={result.applications} />
}
