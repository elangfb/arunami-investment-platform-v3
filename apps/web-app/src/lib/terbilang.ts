// Convert a non-negative integer to Indonesian words ("terbilang") for the MUAP/RSK
// plafond-in-words slot. Returns lowercase words, no currency suffix (caller appends "rupiah").
// Indonesian rules: "se-" prefix for a leading 1 in puluh/belas/ratus/ribu (sepuluh, sebelas,
// seratus, seribu) but NOT for juta and above (satu juta, satu miliar).

const ONES = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
]
const SCALES = ['', 'ribu', 'juta', 'miliar', 'triliun']

function threeDigits(n: number): string {
  const parts: string[] = []
  const ratus = Math.floor(n / 100)
  const rem = n % 100
  if (ratus === 1) parts.push('seratus')
  else if (ratus > 1) parts.push(`${ONES[ratus]} ratus`)
  if (rem > 0 && rem < 12) parts.push(ONES[rem])
  else if (rem >= 12 && rem < 20) parts.push(`${ONES[rem - 10]} belas`)
  else if (rem >= 20) {
    parts.push(`${ONES[Math.floor(rem / 10)]} puluh`)
    if (rem % 10 > 0) parts.push(ONES[rem % 10])
  }
  return parts.join(' ')
}

export function terbilang(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return 'nol'
  const groups: number[] = []
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000)
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    // 1000 = "seribu" (not "satu ribu"); juta+ keep "satu <scale>".
    if (i === 1 && groups[i] === 1) parts.push('seribu')
    else parts.push(SCALES[i] ? `${threeDigits(groups[i])} ${SCALES[i]}` : threeDigits(groups[i]))
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
