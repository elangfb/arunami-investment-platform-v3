import type { User } from '@/lib/types'

// `roleKey` = the DEFAULT_ROLES bundle each seed user is granted. Siti & Budi are both the
// single folded Relationship Manager role (intake/slik/muap-author/pencairan) — AO+LA→RM.
// seed-dummy grants by roleKey; stage-owners derives stage ownership from the bundle's desks.
export const USERS: (User & { roleKey: string })[] = [
  { id: 'u-001', name: 'Siti Rahma', role: 'RM', roleKey: 'relationship-manager', avatarInitials: 'SR', title: 'Relationship Manager', tagline: 'Saya yang pertama ketemu nasabah' },
  { id: 'u-002', name: 'Budi Santoso', role: 'RM', roleKey: 'relationship-manager', avatarInitials: 'BS', title: 'Relationship Manager', tagline: 'Analisa 5C adalah keseharian saya' },
  { id: 'u-003', name: 'Ahmad Fauzi', role: 'RA', roleKey: 'risk-team', avatarInitials: 'AF', title: 'Risk Analyst', tagline: 'Saya punya veto. OJK yang bilang.' },
  { id: 'u-006', name: 'Laila Ahmadi', role: 'LG', roleKey: 'legal', avatarInitials: 'LA', title: 'Legal Officer', tagline: 'Saya pastikan setiap dokumen sah secara hukum' },
  { id: 'u-004', name: 'Dewi Kirana', role: 'CM', roleKey: 'committee', avatarInitials: 'DK', title: 'Ketua Komite Pembiayaan', tagline: 'Keputusan saya mengikat secara hukum' },
  { id: 'u-007', name: 'Rizky Hadiman', role: 'CM', roleKey: 'committee', avatarInitials: 'RH', title: 'Anggota Komite Pembiayaan', tagline: 'Saya menimbang risiko sebelum suara saya jatuh' },
  { id: 'u-008', name: 'Nur Fatimah', role: 'CM', roleKey: 'committee', avatarInitials: 'NF', title: 'Anggota Komite Pembiayaan', tagline: 'Kepatuhan syariah tidak bisa ditawar' },
  { id: 'u-005', name: 'Pak Hendra', role: 'MG', roleKey: 'management', avatarInitials: 'PH', title: 'Management', tagline: 'Saya butuh dashboard, bukan laporan bulanan' },
]

export const getUserById = (id: string) => USERS.find(u => u.id === id)
