import { Given, Then, When } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { applicationAt, meetingFor } from '../support/factories'
import type { MizanWorld } from '../support/world'

// A clean fixture application at a target stage (no field overrides → no hard-gate
// violations, so the MUAP request is not override-gated).
Given('a fixture application at stage {int}', async function (this: MizanWorld, stage: number) {
  const { id } = await applicationAt(stage as 1 | 2 | 3 | 4 | 5 | 6)
  this.fixtureAppId = id
})

// Schedule a committee meeting for the fixture app: the three seeded Komite (Dewi=chair u-004,
// Rizky u-007, Nur u-008) — the blocking MoM signers — plus Budi (u-002, RM) as an added
// involved-team participant who attests non-blocking (ADR-0005 attendance model).
Given('a committee meeting for the fixture application', async function (this: MizanWorld) {
  await meetingFor([this.fixtureAppId], ['u-004', 'u-007', 'u-008', 'u-002'], 'u-004')
})

When('I click the button {string}', async function (this: MizanWorld, name: string) {
  await this.page.getByRole('button', { name }).first().click()
})

Then('I see the text {string}', async function (this: MizanWorld, text: string) {
  await expect(this.page.getByText(text).first()).toBeVisible()
})

When('I fill {string} into the reason field', async function (this: MizanWorld, value: string) {
  await this.page.getByPlaceholder(/Alasan pengembalian/i).fill(value)
})

When('I open the QR of the signed rung', async function (this: MizanWorld) {
  const href = await this.page.locator('a[href^="/qr/"]').first().getAttribute('href')
  if (!href) throw new Error('no QR link rendered on a signed rung')
  await this.page.goto(href)
})

When('I open the komite room for the fixture application', async function (this: MizanWorld) {
  await this.page.goto(`/applications/${this.fixtureAppId}/komite`)
  await expect(this.page.getByText(this.fixtureAppId).first()).toBeVisible()
})

// Success of a generate action is signalled by window.open (a new tab) — runAction only TOASTS on
// error, so a new page means the server action returned a doc URL without throwing. window.open uses
// `noopener`, so the new page surfaces on the browser CONTEXT, not as a page-level "popup".
When('I click {string} and a document is generated', async function (this: MizanWorld, name: string) {
  const newPage = this.page.context().waitForEvent('page')
  await this.page.getByRole('button', { name }).first().click()
  const opened = await newPage
  await opened.close()
})
