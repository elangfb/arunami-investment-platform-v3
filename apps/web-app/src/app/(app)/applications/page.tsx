import { ApplicationsListClient } from '@/components/applications/ApplicationsListClient'
import { listApplications } from '@/server/repo'

export default async function ApplicationsPage() {
  const applications = await listApplications()
  return <ApplicationsListClient applications={applications} />
}
