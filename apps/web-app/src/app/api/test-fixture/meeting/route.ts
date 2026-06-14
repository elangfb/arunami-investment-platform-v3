// E2E fixture endpoint — creates a committee meeting (Rapat Komite) so scenarios can exercise the
// MoM-signing decision flow (ADR-0005). Gated by e2eFixturesEnabled() (E2E_MODE=1 AND a throwaway
// backend); 404 otherwise. Bypasses desk gating on purpose — setup machinery, not a workflow test.
import { NextResponse } from 'next/server'
import { createMeeting } from '@/server/repo'
import { e2eFixturesEnabled } from '@/server/auth/e2e-fixtures'
import type { KomiteMeeting } from '@/lib/types'

interface MeetingFixtureInput {
  agendaAppIds?: string[]
  attendeeUserIds?: string[]
  chairUserId?: string
}

export async function POST(request: Request) {
  if (!e2eFixturesEnabled()) return new NextResponse('Not found', { status: 404 })
  const body = (await request.json().catch(() => ({}))) as MeetingFixtureInput
  const now = new Date()
  const meeting = await createMeeting({
    date: now.toISOString().slice(0, 10),
    time: '10:00',
    room: 'Ruang Komite 1',
    agendaAppIds: body.agendaAppIds ?? [],
    attendeeUserIds: body.attendeeUserIds ?? [],
    chairUserId: body.chairUserId ?? '',
    status: 'upcoming',
    createdBy: 'fixture-system',
    createdAt: now,
  } satisfies Omit<KomiteMeeting, 'id'>)
  return NextResponse.json({ id: meeting.id, meeting })
}
