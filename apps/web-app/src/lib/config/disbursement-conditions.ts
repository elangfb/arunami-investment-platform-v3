export const DEFAULT_DISBURSEMENT_CONDITIONS: string[] = [
  'Plafond disesuaikan dengan keputusan komite',
  'Rekening koran 6 bulan diterima',
  'Akad final disiapkan',
  'Dokumen jaminan original diverifikasi',
]

const MAX_CONDITION_LENGTH = 120
const MAX_CONDITIONS = 15

/** Parse + validate an admin-submitted disbursement release-condition list, or throw (Bahasa). */
export function parseDisbursementConditions(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Daftar syarat pencairan harus berisi minimal 1 syarat.')
  }

  const out: string[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new Error('Syarat pencairan harus berupa teks.')
    }

    const condition = entry.trim()
    if (condition.length === 0) {
      throw new Error('Syarat pencairan tidak boleh kosong.')
    }
    if (condition.length > MAX_CONDITION_LENGTH) {
      throw new Error(`Syarat pencairan maksimal ${MAX_CONDITION_LENGTH} karakter.`)
    }

    const key = condition.toLocaleLowerCase('id-ID')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(condition)
  }

  if (out.length === 0) {
    throw new Error('Daftar syarat pencairan harus berisi minimal 1 syarat.')
  }
  if (out.length > MAX_CONDITIONS) {
    throw new Error(`Daftar syarat pencairan maksimal ${MAX_CONDITIONS} syarat.`)
  }

  return out
}
