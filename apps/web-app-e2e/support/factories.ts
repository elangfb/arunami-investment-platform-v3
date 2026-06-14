// Test-fixture client. POSTs to the running Next app's /api/test-fixture endpoint
// (only enabled when the harness has set DOCS_PROVIDER=stub) to manufacture an
// Application at a target stage. Bypasses desk gating + actor identity — factories
// are setup machinery, not workflow exercises. Scenarios assert behavior against
// the real action handlers after the fixture is in place.
//
// Returns the app's id + stage; scenarios then drive the browser to it.
type Stage = 1 | 2 | 3 | 4 | 5 | 6

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200'

interface FixtureResponse {
  id: string
  stage: Stage
  application: Record<string, unknown>
}

export async function applicationAt(stage: Stage, overrides: Record<string, unknown> = {}): Promise<FixtureResponse> {
  const response = await fetch(`${baseURL}/api/test-fixture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stage, overrides }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`fixture POST failed (${response.status}): ${body}`)
  }
  return response.json() as Promise<FixtureResponse>
}

// Manufacture a committee meeting (Rapat Komite) with the given agenda + attendees + chair, so
// scenarios can exercise the MoM-signing decision flow (ADR-0005).
export async function meetingFor(agendaAppIds: string[], attendeeUserIds: string[], chairUserId: string): Promise<{ id: string }> {
  const response = await fetch(`${baseURL}/api/test-fixture/meeting`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agendaAppIds, attendeeUserIds, chairUserId }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`meeting fixture POST failed (${response.status}): ${body}`)
  }
  return response.json() as Promise<{ id: string }>
}
