import type { Stage, SLAStatus, LoanApplication } from '@/lib/types'
import type { Desk } from '@/lib/desks'
import { businessDaysElapsed } from '@/lib/scheduling/jakarta-clock'
import type { HolidayCalendar } from '@/lib/scheduling/holidays'

// SINGLE SOURCE for SLA day-targets per stage. Doubles as the versioned-config FALLBACK
// and the seed for SlaPolicyVersion v1 (server/config/sla.ts) — keep it as the canonical
// default; admin edits live in the config table, resolved over this.
export const SLA_TARGETS_DAYS: Record<Stage, number> = {
  1: 3, 2: 5, 3: 5, 4: 5, 5: 3, 6: 5,
}

// Returns calendar days elapsed since enteredStageAt
export function getDaysElapsed(enteredStageAt: Date): number {
  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.floor((now.getTime() - enteredStageAt.getTime()) / msPerDay)
}

// All three accept an optional `targetDays` — the per-stage SLA target resolved from
// versioned config (server/config/sla.ts, rides on app.slaTargetDays). Omitted/undefined
// → the code constant, so callers without a config-resolved app stay correct.
export function getSLAStatus(stage: Stage, enteredStageAt: Date, targetDays?: number): SLAStatus {
  const target = targetDays ?? SLA_TARGETS_DAYS[stage]
  const elapsed = getDaysElapsed(enteredStageAt)
  if (elapsed > target) return 'overdue'
  if (elapsed >= target - 1) return 'at_risk'
  return 'normal'
}

export function getDaysRemaining(stage: Stage, enteredStageAt: Date, targetDays?: number): number {
  const target = targetDays ?? SLA_TARGETS_DAYS[stage]
  const elapsed = getDaysElapsed(enteredStageAt)
  return target - elapsed
}

// Human-readable SLA label e.g. "3 hari tersisa", "Terlambat 2 hari", "< 1 hari"
export function getSLALabel(stage: Stage, enteredStageAt: Date, targetDays?: number): string {
  const status = getSLAStatus(stage, enteredStageAt, targetDays)
  const remaining = getDaysRemaining(stage, enteredStageAt, targetDays)
  if (status === 'overdue') return `Terlambat ${Math.abs(remaining)} hari`
  if (status === 'at_risk') return '< 1 hari'
  return `${remaining} hari tersisa`
}

// Terminal-aware SLA. A disbursed (Cair) or committee-rejected application is
// finished — its stage clock must stop, otherwise it keeps reading "Terlambat N
// hari" forever (the alarm-fatigue bug where ~all apps show red). Non-terminal
// apps fall back to the live time-in-stage status. Use this anywhere an `app` is
// in hand; the stage-only getSLAStatus/getSLALabel remain for callers without one.
export function slaState(app: LoanApplication): { status: SLAStatus; label: string } {
  // Closed is terminal regardless of stage (a nasabah-declined conditional app sits at
  // Stage 1 but is finished) — stop the clock before the stage-based fallbacks.
  if (app.applicationStatus === 'closed') return { status: 'done', label: 'Ditutup' }
  if (app.disbursementStatus === 'Cair') return { status: 'done', label: 'Selesai' }
  if (app.komiteDecision === 'reject') return { status: 'done', label: 'Ditolak' }
  return {
    status: getSLAStatus(app.stage, app.enteredStageAt, app.slaTargetDays),
    label: getSLALabel(app.stage, app.enteredStageAt, app.slaTargetDays),
  }
}

export interface DeskSlaResult {
  status: SLAStatus
  label: string
  elapsedBusinessDays: number
  targetBusinessDays: number
}

// Per-DESK SLA status, in BUSINESS DAYS (HK), per Hijra's SOP (desk SLAs are stated in HK, not
// calendar days). Additive over the per-stage model: returns `null` when no per-desk target is
// configured for `desk` — the caller then falls back to the per-stage slaState, so an unconfigured
// deskTargets map preserves today's behavior exactly. The clock-start is PARAMETERIZED (per-event:
// docs-complete / visit / queue / stage-entry) — W1 supplies the per-task triggers; callers default
// it to `enteredStageAt`. at_risk/overdue thresholds mirror getSLAStatus (within 1 HK / past target).
export function deskSlaState(
  desk: Desk,
  clockStart: Date,
  deskTargets: Partial<Record<Desk, number>>,
  now: Date = new Date(),
  holidays?: HolidayCalendar,
): DeskSlaResult | null {
  const target = deskTargets[desk]
  if (target == null) return null
  const elapsed = businessDaysElapsed(clockStart, now, holidays)
  const status: SLAStatus = elapsed > target ? 'overdue' : elapsed >= target - 1 ? 'at_risk' : 'normal'
  const remaining = target - elapsed
  const label =
    status === 'overdue' ? `Terlambat ${Math.abs(remaining)} HK` : status === 'at_risk' ? '< 1 HK' : `${remaining} HK tersisa`
  return { status, label, elapsedBusinessDays: elapsed, targetBusinessDays: target }
}

// Format Rupiah: 500000000 → "Rp 500.000.000"
export function formatRupiah(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID')
}

// Compact absolute Indonesian date: 2026-06-07 → "07 Jun 2026". Deterministic given the
// 'id-ID' ICU data shipped by both Node and the browser, so it is safe to render in a
// client component that also runs through SSR (no hydration drift). Mirrors the format
// used by formatMeetingDate / formatRelativeTime's absolute fallback.
export function formatTanggal(date: Date): string {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Relative Indonesian timestamp for activity/notification feeds:
// "Baru saja" / "5 menit lalu" / "2 jam lalu" / "3 hari lalu", falling back to
// an absolute date beyond a week. Compute on the SERVER and pass the string to
// client islands so the value can't diverge between SSR and hydration.
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} hari lalu`
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
