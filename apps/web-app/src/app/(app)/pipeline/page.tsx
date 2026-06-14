import 'server-only'

import { Page } from '@/components/layout/Page'
import { PipelineTable } from '@/components/pipeline/PipelineTable'
import { listApplications } from '@/server/repo'

export default async function PipelinePage() {
  const applications = await listApplications()

  return (
    <Page.Root>
      <PipelineTable applications={applications} />
    </Page.Root>
  )
}
