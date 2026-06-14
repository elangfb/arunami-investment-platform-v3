import { Given, Then, When } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { signInAs } from '../support/auth'
import type { MizanWorld } from '../support/world'

Given('I sign in as {string}', async function (this: MizanWorld, persona: string) {
  await signInAs(this, persona)
})

When('I open application {string}', async function (this: MizanWorld, id: string) {
  await this.page.goto(`/applications/${id}`)
  await expect(this.page.getByText(id).first()).toBeVisible()
})

When('I open application {string} at view {string}', async function (this: MizanWorld, id: string, view: string) {
  await this.page.goto(`/applications/${id}?view=${view}`)
  await expect(this.page.getByText(id).first()).toBeVisible()
})

Then('the action band shows {string}', async function (this: MizanWorld, text: string) {
  await expect(this.page.getByText(text).first()).toBeVisible()
})

Then('I see the button {string}', async function (this: MizanWorld, name: string) {
  await expect(this.page.getByRole('button', { name }).first()).toBeVisible()
})

Then('I see the link {string}', async function (this: MizanWorld, name: string) {
  await expect(this.page.getByRole('link', { name }).first()).toBeVisible()
})

Then('I see the tab {string}', async function (this: MizanWorld, name: string) {
  await expect(this.page.getByText(new RegExp(`^${name}$`, 'i')).first()).toBeVisible()
})

Then('the {string} tab is selected', async function (this: MizanWorld, name: string) {
  await expect(this.page.getByText(new RegExp(`^${name}$`, 'i')).first()).toBeVisible()
  await expect(this.page).toHaveURL(new RegExp(`[?&]view=${name.toLowerCase()}(?:&|$)`))
})
