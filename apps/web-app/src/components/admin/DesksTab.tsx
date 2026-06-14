'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DeskCatalogRow } from '@/server/repo/users'

// Read-only desk catalogue. Desks are fixed in code (the pipeline is fixed); the
// console configures GRANTS, not the catalogue — so this tab is reference only.
export function DesksTab({ desks }: { desks: DeskCatalogRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {desks.map((d) => (
        <Card key={d.desk}>
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{d.label}</p>
              <Badge variant="outline" className="tabular">{d.desk}</Badge>
            </div>
            {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
            <p className="text-xs text-muted-foreground">
              {d.stage != null ? `Tahap ${d.stage}` : 'Lintas tahap'} · peran {d.pipelineRole}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
