import 'server-only'

import { resolveActiveVersion } from '@/lib/config/versioned'
import { AI_PROMPT_KEYS, DEFAULT_AI_PROMPTS, type AiPromptKey } from '@/lib/ai-prompts'
import { prisma } from '@/server/db'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { aiPromptDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './ai-prompts.prisma'
import * as firestoreImpl from './ai-prompts.firestore'

interface AppendAiPromptOpts {
  promptKey: AiPromptKey
  systemInstruction: string
  effectiveFrom: Date
  reason: string | null
  createdBy: string
}

// Active AI SYSTEM PROMPT per surface, resolved from versioned config (per-key). Backend-routed
// readers; resolveActiveVersion + code-default fallback are pure. appendAiPromptVersion (writer) stays
// Prisma-bound (admin-only; documented firestore-mode write gap).

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface AiPromptRow {
  version: number
  effectiveFrom: Date
  systemInstruction: string
}

export interface AiPromptVersionRow {
  promptKey: AiPromptKey
  version: number
  systemInstruction: string
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

/** Type guard for incoming string → AiPromptKey. */
export function isAiPromptKey(s: string): s is AiPromptKey {
  return (AI_PROMPT_KEYS as readonly string[]).includes(s)
}

const fetchAiPromptRows = dispatchRead(prismaImpl.fetchAiPromptRows, firestoreImpl.fetchAiPromptRows)
const fetchAiPromptVersionRows = dispatchRead(prismaImpl.fetchAiPromptVersionRows, firestoreImpl.fetchAiPromptVersionRows)

/** Active system prompt for the given AI surface. Returns the code DEFAULT when no row is effective. */
export async function getActivePrompt(key: AiPromptKey, at: Date = new Date()): Promise<string> {
  const active = resolveActiveVersion(await fetchAiPromptRows(key), at)
  return active?.systemInstruction ?? DEFAULT_AI_PROMPTS[key]
}

/** All versions for one key, newest first — for the admin Prompts editor's history view. */
export async function listAiPromptVersions(key: AiPromptKey): Promise<AiPromptVersionRow[]> {
  return fetchAiPromptVersionRows(key)
}

/** Append a new version for one key (backend-routed). Caller validates desk + input shape. */
export const appendAiPromptVersion = dispatchWrite(
  'appendAiPromptVersion',
  async (opts: AppendAiPromptOpts) => {
    await prisma.$transaction(async (tx) => {
      const max = await tx.aiPromptVersion.findFirst({ where: { promptKey: opts.promptKey }, orderBy: { version: 'desc' }, select: { version: true } })
      await tx.aiPromptVersion.create({
        data: {
          promptKey: opts.promptKey,
          version: (max?.version ?? 0) + 1,
          systemInstruction: opts.systemInstruction,
          effectiveFrom: opts.effectiveFrom,
          reason: opts.reason,
          createdBy: opts.createdBy,
        },
      })
    })
  },
  async (opts: AppendAiPromptOpts) => {
    await fsAllocateAndCreateVersion({
      collection: COL.config_aiPrompt,
      scope: { promptKey: opts.promptKey },
      docId: (v) => aiPromptDocId(opts.promptKey, v),
      fields: { systemInstruction: opts.systemInstruction },
      effectiveFrom: opts.effectiveFrom,
      reason: opts.reason,
      createdBy: opts.createdBy,
    })
  },
)
