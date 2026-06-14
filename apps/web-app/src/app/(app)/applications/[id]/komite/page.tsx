import { notFound } from 'next/navigation'
import { getApplication, listMeetings } from '@/server/repo'
import { meetingForApp } from '@/lib/komite'
import { KomiteVoting } from '@/components/komite/KomiteVoting'

export default async function KomitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [app, meetings] = await Promise.all([getApplication(id), listMeetings()])
  if (!app) notFound()
  return <KomiteVoting app={app} meeting={meetingForApp(meetings, id) ?? null} />
}
