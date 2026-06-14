// Client → AI route. AiAppContext is the compact app slice the server grounds on
// (defined here so client + server share one shape).
import type { LoanApplication } from './types'
import type { SeedContext } from './seed-context'

export interface AiAppContext {
  nasabahName: string
  nasabahType: string
  akadType: string
  requestedPlafond: number
  requestedTenorMonths: number
  purpose: string
  stage: number
  hardGates: { dsr: number; ltv: number; kol: number }
  hardGateViolations: string[]
  missingDocs: string[]
}

export function buildAiContext(app: LoanApplication): AiAppContext {
  return {
    nasabahName: app.nasabahName,
    nasabahType: app.nasabahType,
    akadType: app.akadType,
    requestedPlafond: app.requestedPlafond,
    requestedTenorMonths: app.requestedTenorMonths,
    purpose: app.purpose,
    stage: app.stage,
    hardGates: app.hardGates,
    hardGateViolations: app.hardGateViolations,
    missingDocs: app.documents.filter((d) => d.required && d.status !== 'uploaded').map((d) => d.name),
  }
}

export async function askApplicationAi(id: string, prompt: string, context: AiAppContext): Promise<string> {
  const res = await fetch(`/api/applications/${id}/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, context }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return (data as { reply: string }).reply
}

// AI-draft the 5C+1S analysis aspects (subset map of aspect → prose). Sends the
// SeedContext (the server can't read the in-memory store). The caller overlays the
// result on the deterministic draft so every aspect is filled.
export async function generateApplicationAnalysis(
  id: string,
  seed: SeedContext,
): Promise<Record<string, string>> {
  const res = await fetch(`/api/applications/${id}/analysis`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return (data as { analysis: Record<string, string> }).analysis ?? {}
}
