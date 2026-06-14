import { Given, Then } from '@cucumber/cucumber'
import { expect, type Page } from '@playwright/test'
import { DEMO_LOGINS } from '../../web-app/src/lib/seed-data/demo-logins'
import type { MizanWorld } from '../support/world'

async function clickFirstVisible(page: Page, labels: (string | RegExp)[]): Promise<boolean> {
  for (const label of labels) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click()
      return true
    }
    const text = page.getByText(label).first()
    if (await text.isVisible().catch(() => false)) {
      await text.click()
      return true
    }
  }
  return false
}

Given('I sign in through the Firebase emulator as {string}', async function (this: MizanWorld, personaName: string) {
  const persona = DEMO_LOGINS.find((d) => d.name === personaName || d.email === personaName)
  if (!persona) throw new Error(`Unknown demo persona: ${personaName}`)

  await this.page.goto('/login')

  const popupPromise = this.page.waitForEvent('popup')
  await this.page.getByRole('button', { name: /masuk dengan google/i }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')

  // The Auth Emulator UI has changed labels across firebase-tools releases. Prefer the
  // seeded account row, but tolerate an intermediate "Google" provider button.
  for (let i = 0; i < 4 && !popup.isClosed(); i++) {
    const picked = await clickFirstVisible(popup, [
      persona.email,
      persona.name,
      new RegExp(persona.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      new RegExp(persona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      /google/i,
      /continue/i,
      /lanjut/i,
      /sign in/i,
    ])
    if (!picked) break
    await popup.waitForTimeout(500).catch(() => undefined)
  }

  await expect(this.page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
})

Then('I am on the dashboard', async function (this: MizanWorld) {
  await expect(this.page).toHaveURL(/\/dashboard$/)
})
