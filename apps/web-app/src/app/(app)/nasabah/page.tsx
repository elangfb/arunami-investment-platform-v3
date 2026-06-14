import { NasabahListClient } from '@/components/nasabah/NasabahListClient'
import { listCustomers } from '@/server/repo/customer'

export default async function NasabahPage() {
  const customers = await listCustomers()
  return <NasabahListClient customers={customers} />
}
