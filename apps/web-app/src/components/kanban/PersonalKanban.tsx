'use client'

import { useMemo, useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Page } from '@/components/layout/Page'
import { ApplicationCard } from '@/components/kanban/ApplicationCard'
import { useActor } from '@/context/ActorProvider'
import type { LoanApplication, PersonalStatus, StageAssignment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { setPersonalStatusAction } from '@/server/actions/personal-status'
import { toast } from 'sonner'

type DraggableStatus = Extract<PersonalStatus, 'todo' | 'in_progress'>

type ColumnConfig = {
  status: PersonalStatus
  title: string
  dotClass: string
  countClass: string
  emptyText: string
  locked?: boolean
}

const DRAGGABLE_STATUSES: DraggableStatus[] = ['todo', 'in_progress']

// Per-column identity colours (not the protected SLA/proses status vocabulary):
// TODO blue · In Progress amber · Submitted emerald.
const COLUMNS: ColumnConfig[] = [
  {
    status: 'todo',
    title: 'Tugas Saya',
    dotClass: 'bg-blue-500',
    countClass: 'bg-blue-100 text-blue-700',
    emptyText: 'Tidak ada yang perlu dikerjakan sekarang',
  },
  {
    status: 'in_progress',
    title: 'Sedang Diproses',
    dotClass: 'bg-amber-500',
    countClass: 'bg-amber-100 text-amber-700',
    emptyText: 'Belum ada pekerjaan yang sedang diproses',
  },
  {
    status: 'submitted',
    title: 'Terkirim / Menunggu',
    dotClass: 'bg-emerald-500',
    countClass: 'bg-emerald-100 text-emerald-700',
    emptyText: 'Belum ada pengajuan yang menunggu respons',
    locked: true,
  },
]

function isDraggableStatus(status: PersonalStatus): status is DraggableStatus {
  return DRAGGABLE_STATUSES.includes(status as DraggableStatus)
}

// The current user's relevant desk for an application: the most recent
// assignment record bearing their id (assignments are append-only and
// chronological, so the last match is the latest).
function userAssignment(app: LoanApplication, userId: string): StageAssignment | undefined {
  return app.assignments.filter((assignment) => assignment.userId === userId).at(-1)
}

function findAppStatus(apps: LoanApplication[], id: string, userId: string): PersonalStatus | null {
  const app = apps.find((item) => item.id === id)
  return app ? userAssignment(app, userId)?.status ?? null : null
}

function updateAssignmentStatus(apps: LoanApplication[], id: string, userId: string, status: PersonalStatus) {
  const app = apps.find((item) => item.id === id)
  const assignment = app ? userAssignment(app, userId) : undefined
  if (assignment) assignment.status = status
}

function SortableApplicationCard({
  application,
  status,
  disabled = false,
}: {
  application: LoanApplication
  status: PersonalStatus
  disabled?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    disabled,
    data: { status },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'z-10 opacity-60')}
      {...attributes}
      {...listeners}
    >
      <ApplicationCard app={application} draggable={!disabled} />
    </div>
  )
}

function KanbanColumn({ column, apps }: { column: ColumnConfig; apps: LoanApplication[] }) {
  const acceptsDrop = isDraggableStatus(column.status)
  const { setNodeRef, isOver } = useDroppable({
    id: column.status,
    disabled: !acceptsDrop,
    data: { status: column.status },
  })

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-[320px] flex-col rounded-2xl px-2 py-3 transition-colors border-border bg-card',
        acceptsDrop && isOver && 'bg-accent/60 ring-1 ring-inset ring-primary/40'
      )}
    >
      <div className="mb-3 flex items-center gap-2 px-1.5">
        <span className={cn('size-2.5 shrink-0 rounded-full', column.dotClass)} />
        <h3 className="font-semibold text-foreground">{column.title}</h3>
        {column.locked ? <Lock className="size-3.5 text-muted-foreground" aria-label="Read-only" /> : null}
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular', column.countClass)}>
          {apps.length}
        </span>
      </div>

      <SortableContext items={apps.map((app) => app.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-3 px-0.5 pb-1">
          {apps.length > 0 ? (
            apps.map((app) => (
              <SortableApplicationCard key={app.id} application={app} status={column.status} disabled={column.locked} />
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/50 p-6 text-center text-sm text-muted-foreground">
              {column.emptyText}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

export function PersonalKanban({ applications }: { applications: LoanApplication[] }) {
  const actor = useActor()
  const [apps, setApps] = useState<LoanApplication[]>(() => [...applications])
  const [, startPersist] = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const appsByStatus = useMemo(
    () =>
      COLUMNS.reduce<Record<PersonalStatus, LoanApplication[]>>(
        (acc, column) => {
          acc[column.status] = apps.filter(
            (app) => userAssignment(app, actor.userId)?.status === column.status
          )
          return acc
        },
        { todo: [], in_progress: [], submitted: [] }
      ),
    [apps, actor.userId]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeStatus = findAppStatus(apps, activeId, actor.userId)
    const overStatus = COLUMNS.some((column) => column.status === overId)
      ? (overId as PersonalStatus)
      : findAppStatus(apps, overId, actor.userId)

    if (!activeStatus || !overStatus) return
    if (!isDraggableStatus(activeStatus) || !isDraggableStatus(overStatus)) return

    if (activeStatus === overStatus) {
      // Reorder within a column — ephemeral visual ordering only (no persisted order field).
      setApps((currentApps) => {
        const activeIndex = currentApps.findIndex((app) => app.id === activeId)
        const overIndex = currentApps.findIndex((app) => app.id === overId)
        if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return currentApps
        return arrayMove(currentApps, activeIndex, overIndex)
      })
      return
    }

    // Cross-column status change (Tugas Saya ↔ Sedang Diproses): optimistic move, then persist.
    setApps((currentApps) => {
      if (!currentApps.some((app) => app.id === activeId)) return currentApps
      updateAssignmentStatus(currentApps, activeId, actor.userId, overStatus)
      return currentApps.map((app) => (app.id === activeId ? { ...app, assignments: [...app.assignments] } : app))
    })
    startPersist(async () => {
      try {
        await setPersonalStatusAction(activeId, overStatus as DraggableStatus)
      } catch {
        // Revert the optimistic move on failure (e.g. a concurrent workflow write bumped the version).
        setApps((currentApps) => {
          updateAssignmentStatus(currentApps, activeId, actor.userId, activeStatus)
          return currentApps.map((app) => (app.id === activeId ? { ...app, assignments: [...app.assignments] } : app))
        })
        toast.error('Gagal menyimpan perubahan status. Coba lagi.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <Page.Header
        title="Beranda Saya"
        description={
          <>
            Tugas Anda dikelompokkan per status. Seret kartu antara{' '}
            <span className="font-medium text-foreground">Tugas Saya</span> dan{' '}
            <span className="font-medium text-foreground">Sedang Diproses</span> untuk mengatur prioritas harian.
          </>
        }
      />

      <DndContext id="personal-kanban" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="stagger grid gap-2 lg:grid-cols-3">
          {COLUMNS.map((column) => (
            <KanbanColumn key={column.status} column={column} apps={appsByStatus[column.status]} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

export default PersonalKanban
