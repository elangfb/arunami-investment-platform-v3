import type { Desk } from '@/lib/desks'

// Maps an Alur-kerja workstream (lib/workstreams.ts) to the cross-desk COLEK target it can nudge.
// A colek is a DIRECTED request from one desk to ANOTHER desk (design Follow-up-decisions "A1 colek"),
// so only the streams owned by a non-RM desk are colek-able — RM coordinates its own streams (dokumen,
// SLIK/Kol, 5C+1S, MUAP, pencairan) and never coleks itself; Komite is administered, not colek-ed.
// Keyed by the stream `id` (stable) rather than its owner Role (LG owns both legal + penilaian, which
// are DIFFERENT desks). Each entry carries a default Bahasa work-request description for that stream.
export interface ColekStreamTarget {
  desk: Desk
  /** Default Bahasa description sent when colek-ing this stream (the nudge's body). */
  description: string
  /** Short Bahasa label for the desk, used in the button ("Colek <label>"). */
  deskLabel: string
}

export const COLEK_STREAM_TARGETS: Record<string, ColekStreamTarget> = {
  legal: { desk: 'legal', deskLabel: 'Legal', description: 'Mohon kerjakan Analisa Yuridis untuk pengajuan ini.' },
  penilaian: { desk: 'appraisal', deskLabel: 'Penilaian', description: 'Mohon kerjakan Penilaian Agunan untuk pengajuan ini.' },
  rsk: { desk: 'rsk-author', deskLabel: 'Risiko', description: 'Mohon kerjakan Kajian Risiko (RSK) untuk pengajuan ini.' },
}

/** The colek target for a workstream id, or null if the stream is not colek-able (RM-owned / Komite). */
export function colekTargetForStream(streamId: string): ColekStreamTarget | null {
  return COLEK_STREAM_TARGETS[streamId] ?? null
}
