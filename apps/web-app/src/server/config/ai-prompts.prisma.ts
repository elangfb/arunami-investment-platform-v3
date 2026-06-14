import 'server-only'
import { prisma } from '@/server/db'
import type { AiPromptKey } from '@/lib/ai-prompts'
import type { AiPromptRow, AiPromptVersionRow } from './ai-prompts'

export async function fetchAiPromptRows(key: AiPromptKey): Promise<AiPromptRow[]> {
  return prisma.aiPromptVersion.findMany({
    where: { promptKey: key },
    select: { version: true, effectiveFrom: true, systemInstruction: true },
  }) as Promise<AiPromptRow[]>
}

export async function fetchAiPromptVersionRows(key: AiPromptKey): Promise<AiPromptVersionRow[]> {
  const rows = await prisma.aiPromptVersion.findMany({ where: { promptKey: key }, orderBy: { version: 'desc' } })
  return rows.map((r) => ({
    promptKey: r.promptKey as AiPromptKey,
    version: r.version,
    systemInstruction: r.systemInstruction,
    effectiveFrom: r.effectiveFrom,
    reason: r.reason ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }))
}
