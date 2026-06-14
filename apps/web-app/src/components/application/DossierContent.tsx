'use client'

import { DataTab } from '@/components/application/DataTab'
import { DocumentsTab } from '@/components/application/DocumentsTab'
import { MUAPTab } from '@/components/application/MUAPTab'
import { RSKTab } from '@/components/application/RSKTab'
import { PencairanTab } from '@/components/application/PencairanTab'
import { DiscussionTab } from '@/components/application/DiscussionTab'
import { HistoryTab } from '@/components/application/HistoryTab'
import { RingkasanView } from '@/components/application/RingkasanView'
import type { DetailView } from '@/lib/detail-nav'
import type { LoanApplication } from '@/lib/types'

// Renders the active dossier surface. The switch is the same one DetailTabs used
// (verbatim view→component mapping), plus the new Ringkasan landing pane.
export function DossierContent({
  app,
  onUpdate,
  view,
  onViewChange,
}: {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  view: DetailView
  onViewChange: (v: DetailView) => void
}) {
  switch (view) {
    case 'ringkasan': return <RingkasanView app={app} onUpdate={onUpdate} onViewChange={onViewChange} />
    case 'data': return <DataTab app={app} onUpdate={onUpdate} onViewDocuments={() => onViewChange('documents')} />
    case 'documents': return <DocumentsTab app={app} onUpdate={onUpdate} />
    case 'muap': return <MUAPTab app={app} onUpdate={onUpdate} />
    case 'rsk': return <RSKTab app={app} onUpdate={onUpdate} />
    case 'pencairan': return <PencairanTab app={app} onUpdate={onUpdate} />
    case 'discussion': return <DiscussionTab app={app} onUpdate={onUpdate} />
    case 'history': return <HistoryTab app={app} />
  }
}
