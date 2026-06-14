import { listApplications, listMeetings } from '@/server/repo'
import { KomiteClient } from '@/components/komite/KomiteClient'
import { getActiveCommitteeRooms } from '@/server/config/rooms'

export default async function KomitePage() {
  const [applications, meetings, rooms] = await Promise.all([listApplications(), listMeetings(), getActiveCommitteeRooms()])
  return <KomiteClient applications={applications} meetings={meetings} rooms={rooms} />
}
