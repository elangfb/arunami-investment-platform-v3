// Indonesian national holidays + cuti bersama (SKB 3 Menteri), as Asia/Jakarta calendar dates
// 'YYYY-MM-DD'. This BUNDLED snapshot is the deterministic floor AND the offline/CI/API-failure
// fallback (jakarta-holiday-calendar.md): the SLA business-day clock excludes these even with no DB
// or network. Admin overrides + the per-year public-holiday fetch augment it at runtime
// (server/config/holidays.ts → resolveHolidayCalendar). Source: setneg.go.id SKB 3 Menteri 2026
// (verified 2026.06.09). Weekend entries are inert for business-day counting (the clock only counts
// Mon–Fri) but kept for calendar fidelity.

/** A set of 'YYYY-MM-DD' (Asia/Jakarta) non-business dates. */
export type HolidayCalendar = ReadonlySet<string>

// 17 national holidays + 8 cuti bersama = the 25 official "tanggal merah" for 2026.
const HOLIDAYS_2026: readonly string[] = [
  '2026-01-01', // Tahun Baru Masehi
  '2026-01-16', // Isra Mikraj
  '2026-02-16', // Cuti bersama Imlek
  '2026-02-17', // Tahun Baru Imlek
  '2026-03-18', // Cuti bersama Nyepi
  '2026-03-19', // Nyepi
  '2026-03-20', // Cuti bersama Idul Fitri
  '2026-03-21', // Idul Fitri
  '2026-03-22', // Idul Fitri
  '2026-03-23', // Cuti bersama Idul Fitri
  '2026-03-24', // Cuti bersama Idul Fitri
  '2026-04-03', // Wafat Isa Almasih (Good Friday)
  '2026-04-05', // Kebangkitan Isa Almasih (Easter)
  '2026-05-01', // Hari Buruh
  '2026-05-14', // Kenaikan Isa Almasih
  '2026-05-15', // Cuti bersama Kenaikan Isa Almasih
  '2026-05-27', // Idul Adha
  '2026-05-28', // Cuti bersama Idul Adha
  '2026-05-31', // Waisak
  '2026-06-01', // Hari Lahir Pancasila
  '2026-08-17', // Hari Kemerdekaan
  '2026-09-16', // Tahun Baru Islam 1448 H
  '2026-11-25', // Maulid Nabi Muhammad
  '2026-12-24', // Cuti bersama Natal
  '2026-12-25', // Natal
  '2026-12-26', // Cuti bersama Natal
]

/** The bundled national calendar — the default for the SLA clock + the fallback when no DB/API. */
export const BUNDLED_HOLIDAYS: HolidayCalendar = new Set(HOLIDAYS_2026)

/**
 * Merge a base calendar with admin add/remove overrides (admin wins): base ∪ added − removed.
 * Pure; the server resolver feeds (bundled ∪ fetched) as `base` and the admin version's lists as
 * the overrides. A removed date wins over a base/added entry (so an admin can drop a fetched date).
 */
export function mergeHolidayCalendar(
  base: Iterable<string>,
  added: Iterable<string> = [],
  removed: Iterable<string> = [],
): Set<string> {
  const set = new Set(base)
  for (const d of added) set.add(d)
  for (const d of removed) set.delete(d)
  return set
}
