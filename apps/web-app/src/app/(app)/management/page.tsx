import 'server-only'

import { ManagementDashboard } from '@/components/dashboard/ManagementDashboard'
import { Page } from '@/components/layout/Page'
import { listApplications } from '@/server/repo'

export default async function ManagementPage() {
  const applications = await listApplications()

  return (
    <Page.Root>
      <ManagementDashboard applications={applications} />
    </Page.Root>
  )
}
