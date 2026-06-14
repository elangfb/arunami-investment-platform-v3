import { expect } from '@playwright/test'
import type { MizanWorld } from './world'

export async function signInAs(world: MizanWorld, persona: string | RegExp): Promise<void> {
  const label = typeof persona === 'string' ? persona : persona.source
  await world.page.goto('/login')
  const response = await world.page.evaluate(async (wanted) => {
    const res = await fetch('/api/test-fixture/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: wanted }),
    })
    return { ok: res.ok, status: res.status, text: await res.text() }
  }, label)
  if (!response.ok) {
    throw new Error(`E2E login failed (${response.status}): ${response.text}`)
  }
  await world.page.goto('/dashboard')
  await expect(world.page).toHaveURL(/\/dashboard$/)
}
