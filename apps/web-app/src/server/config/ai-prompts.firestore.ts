import 'server-only'
import { COL } from '@/server/firebase/collections'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { AiPromptKey } from '@/lib/ai-prompts'
import type { AiPromptRow, AiPromptVersionRow } from './ai-prompts'

export async function fetchAiPromptRows(key: AiPromptKey): Promise<AiPromptRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_aiPrompt, [{ field: 'promptKey', value: key }])
  return rows.map((d) => ({
    version: d.version as number,
    effectiveFrom: d.effectiveFrom as Date,
    systemInstruction: d.systemInstruction as string,
  }))
}

export async function fetchAiPromptVersionRows(key: AiPromptKey): Promise<AiPromptVersionRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_aiPrompt, [{ field: 'promptKey', value: key }])
  return rows
    .map((d) => ({
      promptKey: d.promptKey as AiPromptKey,
      version: d.version as number,
      systemInstruction: d.systemInstruction as string,
      effectiveFrom: d.effectiveFrom as Date,
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: d.createdAt as Date,
    }))
    .sort((a, b) => b.version - a.version)
}
