import { Given, When, type DataTable } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { applicationAt } from '../support/factories'
import type { MizanWorld } from '../support/world'

// Manufacture an application at a target stage with field overrides (a key/value table).
// Used to stage post-decision / terminal states the workflow rules would otherwise gate.
Given(
  'a fixture application at stage {int} with:',
  async function (this: MizanWorld, stage: number, table: DataTable) {
    const overrides = table.rowsHash() as Record<string, unknown>
    const { id } = await applicationAt(stage as 1 | 2 | 3 | 4 | 5 | 6, overrides)
    this.fixtureAppId = id
  },
)

When('I open the fixture application', async function (this: MizanWorld) {
  await this.page.goto(`/applications/${this.fixtureAppId}`)
  await expect(this.page.getByText(this.fixtureAppId).first()).toBeVisible()
})

When('I open the fixture application at view {string}', async function (this: MizanWorld, view: string) {
  await this.page.goto(`/applications/${this.fixtureAppId}?view=${view}`)
  await expect(this.page.getByText(this.fixtureAppId).first()).toBeVisible()
})
