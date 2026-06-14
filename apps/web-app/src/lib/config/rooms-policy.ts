export const DEFAULT_COMMITTEE_ROOMS: string[] = ['Ruang Komite Lt.5', 'Ruang Meeting A']

const MAX_ROOM_NAME_LENGTH = 80
const MAX_ROOMS = 20

/** Parse + validate an admin-submitted committee-room list, or throw (Bahasa). */
export function parseRooms(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Daftar ruang komite harus berisi minimal 1 ruang.')
  }

  const out: string[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new Error('Nama ruang komite harus berupa teks.')
    }

    const room = entry.trim()
    if (room.length === 0) {
      throw new Error('Nama ruang komite tidak boleh kosong.')
    }
    if (room.length > MAX_ROOM_NAME_LENGTH) {
      throw new Error(`Nama ruang komite maksimal ${MAX_ROOM_NAME_LENGTH} karakter.`)
    }

    const key = room.toLocaleLowerCase('id-ID')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(room)
  }

  if (out.length === 0) {
    throw new Error('Daftar ruang komite harus berisi minimal 1 ruang.')
  }
  if (out.length > MAX_ROOMS) {
    throw new Error(`Daftar ruang komite maksimal ${MAX_ROOMS} ruang.`)
  }

  return out
}
