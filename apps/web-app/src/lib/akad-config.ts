import type { AkadType } from '@/lib/types'

// Single source of truth for akad-type behaviour. Replaces the scattered
// `akadType === 'Murabahah' || 'Ijarah'` checks so the bank's return is named
// and modelled consistently everywhere (forms, drafts, MUAP, RSK, komite).
//
// Two families:
//  - Flat akad (Murabahah, Ijarah): a fixed return rate (margin / ujrah); DSR
//    numerator is the proposed monthly installment.
//  - Profit-share akad (Musyarakah, Mudharabah): a profit-sharing ratio
//    (nisbah); DSR numerator is the projected monthly profit share.
export interface AkadConfig {
  returnLabel: string        // noun: "margin" | "ujrah" | "nisbah bagi hasil"
  returnRateLabel: string    // form field label for the rate / ratio
  usesMargin: boolean        // flat akad → a margin/ujrah rate applies
  usesNisbah: boolean        // profit-share akad → a nisbah split applies
  isProfitShare: boolean
  dsrBasisField: 'proposedMonthlyInstallment' | 'projectedMonthlyProfitShare'
}

export const AKAD_CONFIG: Record<AkadType, AkadConfig> = {
  Murabahah: { returnLabel: 'margin', returnRateLabel: 'Tingkat Margin (% per tahun)', usesMargin: true, usesNisbah: false, isProfitShare: false, dsrBasisField: 'proposedMonthlyInstallment' },
  Ijarah: { returnLabel: 'ujrah', returnRateLabel: 'Tingkat Ujrah (% per tahun)', usesMargin: true, usesNisbah: false, isProfitShare: false, dsrBasisField: 'proposedMonthlyInstallment' },
  Musyarakah: { returnLabel: 'nisbah bagi hasil', returnRateLabel: 'Nisbah Bagi Hasil (Bank : Nasabah)', usesMargin: false, usesNisbah: true, isProfitShare: true, dsrBasisField: 'projectedMonthlyProfitShare' },
  Mudharabah: { returnLabel: 'nisbah bagi hasil', returnRateLabel: 'Nisbah Bagi Hasil (Bank : Nasabah)', usesMargin: false, usesNisbah: true, isProfitShare: true, dsrBasisField: 'projectedMonthlyProfitShare' },
}

export function akadConfig(akad: AkadType): AkadConfig {
  return AKAD_CONFIG[akad]
}

export function isFlatAkad(akad: AkadType): boolean {
  return !AKAD_CONFIG[akad].isProfitShare
}

// Title-cased return noun for sentence-initial use ("Margin", "Ujrah", "Nisbah bagi hasil").
export function returnLabelCap(akad: AkadType): string {
  const l = AKAD_CONFIG[akad].returnLabel
  return l.charAt(0).toUpperCase() + l.slice(1)
}

// Mudharabah (full trustee financing) carries a stricter syariah bar: the
// analyst must cover expertise scope, management boundaries, and the
// fraud/negligence (ta'addi/taqshir) definition.
export function hasStricterSyariahBar(akad: AkadType): boolean {
  return akad === 'Mudharabah'
}
