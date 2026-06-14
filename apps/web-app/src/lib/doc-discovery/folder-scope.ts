// Folder-scope map for document discovery (RM-led redesign, design §3 "Document storage").
//
// Every required document lives in ONE of two Drive folders per the design's two-folder model:
//   - 'nasabah' — the CUSTOMER-level folder, shared BY REFERENCE across all of a customer's deals.
//     Carry-forward identity/legal that persist across deals (KTP, NPWP, Kartu Keluarga, akta,
//     NIB, SIUP, pengurus/pemegang-saham registers). Re-using the same customer for a new
//     application inherits these without re-upload.
//   - 'app' — the APP-SPECIFIC folder, one per deal. Everything tied to THIS financing: the deal's
//     financials, agunan/collateral, akad/objek docs, RAB/kontrak, slip gaji, rekening koran, SPT.
//
// THIS SPLIT DRIVES THE TWO CHECKLIST CARDS in the UI: "Dokumen Nasabah" (nasabah-scope) vs
// "Dokumen Pengajuan" (app-scope). The discovery service (src/server/discovery/discover.ts) lists
// each folder separately and reconciles each card's docTypes against its own folder's files, so a
// nasabah-level doc never appears on the pengajuan card and vice-versa.
//
// Keys are the REAL docType keys from src/lib/required-docs.ts. A docType not listed here defaults
// to 'app' (per-deal) — the safe default, since an unmapped new doc is almost always deal-specific.

export type FolderScope = 'nasabah' | 'app'

/**
 * Explicit scope for the carry-forward NASABAH-level docs. Everything NOT listed here is 'app'
 * (per-deal) via the default in folderScopeForDocType. Only nasabah-scope keys are enumerated so
 * the long tail of deal-specific docTypes (agunan, akad, financials, …) needs no upkeep here.
 */
export const DOC_FOLDER_SCOPE: Record<string, FolderScope> = {
  // --- Individual identity (carry-forward) ---
  ktp: 'nasabah',
  npwp: 'nasabah',
  kartu_keluarga: 'nasabah',
  buku_nikah: 'nasabah',
  // --- Business legal identity (carry-forward) ---
  akta_pendirian: 'nasabah',
  sk_kemenkumham: 'nasabah',
  nib: 'nasabah',
  siup: 'nasabah',
  ktp_pengurus: 'nasabah',
  daftar_pemegang_saham: 'nasabah',
  daftar_pengurus_komisaris: 'nasabah',
}

/** The folder scope a docType belongs to. Defaults to 'app' (per-deal) when unmapped. */
export function folderScopeForDocType(docType: string): FolderScope {
  return DOC_FOLDER_SCOPE[docType] ?? 'app'
}
