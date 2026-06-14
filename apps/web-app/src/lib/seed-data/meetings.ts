import type { KomiteMeeting } from '@/lib/types'

// In-memory committee meetings (prototype store — resets on hard refresh, mirrors
// APPLICATIONS). Each meeting carries its own attendees + chair; the MoM-signing rules
// (ADR-0005, no in-app voting) derive required signers from the attending Komite. The two
// UPCOMING meetings host the Stage-5 seed apps awaiting a decision; the COMPLETED meeting
// documents the recently-decided apps (minutes recorded, per-app MoM QR-signed — those
// signatures live on each app's approvalSteps ledger, chain='mom'). Chairs differ across
// meetings (Dewi Kirana vs Rizky Hadiman) to exercise the per-meeting chair path.
export const MEETINGS: KomiteMeeting[] = [
  {
    id: 'MTG-2026-001',
    date: '2026-05-26',
    time: '09:00',
    room: 'Ruang Komite Lt.5',
    agendaAppIds: ['FOS-2026-009', 'FOS-2026-021'],
    attendeeUserIds: ['u-004', 'u-007', 'u-008'],
    chairUserId: 'u-004', // Dewi Kirana
    notes: 'Sidang komite mingguan — 2 aplikasi modal kerja menunggu keputusan.',
    status: 'upcoming',
    createdBy: 'u-004',
    createdAt: new Date('2026-05-20T16:00:00+07:00'),
  },
  {
    id: 'MTG-2026-002',
    date: '2026-05-28',
    time: '14:00',
    meetingUrl: 'https://zoom.us/j/9876543210', // rapat daring — tanpa ruangan fisik
    agendaAppIds: ['FOS-2026-025', 'FOS-2026-026'],
    attendeeUserIds: ['u-004', 'u-007', 'u-008'],
    chairUserId: 'u-007', // Rizky Hadiman — Ketua pengganti for this session
    notes: 'Sidang komite — dipimpin Ketua pengganti.',
    status: 'upcoming',
    createdBy: 'u-004',
    createdAt: new Date('2026-05-21T10:00:00+07:00'),
  },
  {
    // Completed session: outcome recorded + per-app MoM QR-signed by all attending Komite
    // (signatures on each app's approvalSteps, chain='mom'). Minutes (notulen) recorded H+1.
    id: 'MTG-2026-003',
    date: '2026-05-19',
    time: '14:00',
    room: 'Ruang Komite Lt.5',
    agendaAppIds: ['FOS-2026-016', 'FOS-2026-017', 'FOS-2026-018', 'FOS-2026-035', 'FOS-2026-036'],
    attendeeUserIds: ['u-004', 'u-007', 'u-008'],
    chairUserId: 'u-004', // Dewi Kirana
    notes: 'Sidang komite — 5 aplikasi diputus (3 disetujui, 1 bersyarat, 1 ditolak).',
    minutes:
      'Notulen Rapat Komite Pembiayaan. Hadir: Dewi Kirana (Ketua), Rizky Hadiman, Nur Fatimah. ' +
      'Keputusan: FOS-2026-016/035/036 DISETUJUI (035/036 dengan penyesuaian plafond sesuai catatan); ' +
      'FOS-2026-017 DISETUJUI BERSYARAT; FOS-2026-018 DITOLAK. ' +
      'Seluruh anggota Komite yang hadir menandatangani MoM per aplikasi secara elektronik (QR).',
    minutesRecordedAt: new Date('2026-05-20T11:00:00+07:00'),
    minutesRecordedBy: 'u-004',
    status: 'completed',
    createdBy: 'u-004',
    createdAt: new Date('2026-05-12T16:00:00+07:00'),
  },
]
