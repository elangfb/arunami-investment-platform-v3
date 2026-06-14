import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getApplication } from '@/server/repo'
import { DetailClient } from '@/components/application/DetailClient'

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const app = await getApplication(id)
  if (!app) notFound()
  // Suspense boundary required by nuqs: useQueryState reads URL state which can
  // trigger a CSR bailout in Next App Router without it.
  // key by id so navigating between applications remounts the client with fresh
  // initial state (the page RSC re-fetches per id from the repo).
  return (
    <Suspense>
      <DetailClient key={app.id} initial={app} />
    </Suspense>
  )
}
