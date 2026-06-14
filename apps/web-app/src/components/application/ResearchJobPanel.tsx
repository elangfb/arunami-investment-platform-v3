'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  cancelResearchJobAction,
  enqueueResearchJobAction,
  getLatestResearchJobAction,
} from '@/server/actions/research-job'

interface JobView {
  id: string
  status: string
  startedAt: Date | null
  completedAt: Date | null
  elapsedMs: number | null
  progress: unknown
  errorMessage: string | null
  cancelRequested: boolean
}

/**
 * Research job progress + cancel UI (T11) — slots into MUAPTab alongside the existing
 * synchronous research button. Use this for long-running (>1 min) jobs once T9's full
 * agent is the default; the existing synchronous button stays for quick deterministic
 * pulls until the workflow team flips the cutover.
 *
 * Polls every 5s for status until terminal. Renders a current-activity line + elapsed
 * time + "Hentikan & Buat Dokumen" button that commits partial results.
 */
export function ResearchJobPanel({ appId }: { appId: string }) {
  const [job, setJob] = useState<JobView | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function tick(): Promise<void> {
      const j = await getLatestResearchJobAction(appId)
      if (cancelled) return
      setJob(
        j
          ? {
              id: j.id,
              status: j.status,
              startedAt: j.startedAt,
              completedAt: j.completedAt,
              elapsedMs: j.elapsedMs,
              progress: j.progress,
              errorMessage: j.errorMessage,
              cancelRequested: j.cancelRequested,
            }
          : null,
      )
      if (!cancelled && j && (j.status === 'queued' || j.status === 'running')) {
        setTimeout(tick, 5000)
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [appId])

  const isActive = job && (job.status === 'queued' || job.status === 'running')

  function onEnqueue(): void {
    startTransition(async () => {
      const { jobId } = await enqueueResearchJobAction(appId)
      setJob({
        id: jobId,
        status: 'queued',
        startedAt: null,
        completedAt: null,
        elapsedMs: null,
        progress: null,
        errorMessage: null,
        cancelRequested: false,
      })
    })
  }
  function onCancel(): void {
    if (!job) return
    startTransition(async () => {
      await cancelResearchJobAction(job.id)
      setJob((prev) => (prev ? { ...prev, cancelRequested: true } : prev))
    })
  }

  if (!job) {
    return (
      <div className="rounded-md border border-slate-200 p-3 text-sm">
        <p className="mb-2 text-slate-600">Belum ada riset background yang dijalankan.</p>
        <button
          onClick={onEnqueue}
          disabled={pending}
          className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
        >
          {pending ? 'Memuat…' : 'Jalankan Riset (background)'}
        </button>
      </div>
    )
  }

  const elapsedSec = job.elapsedMs ? Math.round(job.elapsedMs / 1000) : null
  const startedAtLabel = job.startedAt ? new Date(job.startedAt).toLocaleString('id-ID') : '—'

  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Riset background</span>
        <span
          className={
            job.status === 'completed'
              ? 'text-emerald-700'
              : job.status === 'failed' || job.status === 'failed-restart'
                ? 'text-red-700'
                : job.status === 'cancelled'
                  ? 'text-amber-700'
                  : 'text-slate-700'
          }
        >
          {job.status}
          {job.cancelRequested && job.status === 'running' ? ' (cancel diminta)' : ''}
        </span>
      </div>
      <div className="text-xs text-slate-600">
        <div>Mulai: {startedAtLabel}</div>
        {elapsedSec !== null && <div>Elapsed: {elapsedSec}s</div>}
        {!!(job.progress as { lastActivity?: string } | null)?.lastActivity && (
          <div>Aktivitas: {(job.progress as { lastActivity?: string }).lastActivity}</div>
        )}
        {job.errorMessage && <div className="text-red-700">Error: {job.errorMessage}</div>}
      </div>
      {isActive && !job.cancelRequested && (
        <button
          onClick={onCancel}
          disabled={pending}
          className="mt-2 rounded border border-amber-400 px-3 py-1 text-amber-700 disabled:opacity-50"
        >
          Hentikan & Buat Dokumen
        </button>
      )}
      {!isActive && (
        <button
          onClick={onEnqueue}
          disabled={pending}
          className="mt-2 rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
        >
          {pending ? 'Memuat…' : 'Jalankan ulang'}
        </button>
      )}
    </div>
  )
}
