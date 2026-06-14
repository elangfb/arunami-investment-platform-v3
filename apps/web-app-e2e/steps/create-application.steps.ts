import { Given, Then, When } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { signInAs } from '../support/auth'
import type { MizanWorld } from '../support/world'

Given('I am logged in as an Account Officer', async function (this: MizanWorld) {
  await signInAs(this, 'Siti Rahma')
})

When('I create a Murabahah financing application', async function (this: MizanWorld) {
  this.applicationName = `E2E Nasabah ${Date.now()}`

  await this.page.getByRole('link', { name: /aplikasi baru|new application/i }).click()
  await expect(this.page.getByRole('heading', { name: /buat aplikasi pembiayaan/i })).toBeVisible()

  await this.page.getByLabel(/nama nasabah/i).fill(this.applicationName)
  await this.page.getByLabel(/no\. telepon/i).fill('0812-3456-7890')
  await this.page.getByLabel(/plafond/i).fill('500000000')
  await this.page.getByLabel(/tenor/i).fill('24')
  await this.page.getByLabel(/tujuan pembiayaan/i).fill('Pembelian aset usaha untuk skenario smoke test E2E')
  await this.page.addStyleTag({ content: '[title^="Isi formulir"] { display: none !important; }' })
  await this.page.getByRole('button', { name: /^buat aplikasi$/i }).click()
})

Then('I can find the application in the pipeline', async function (this: MizanWorld) {
  await expect(this.page).toHaveURL(/\/pipeline$/)

  await this.page.getByPlaceholder(/cari nasabah atau id/i).fill(this.applicationName)
  await expect(this.page.getByText(this.applicationName).first()).toBeVisible()
  await expect(this.page.getByText('Murabahah').first()).toBeVisible()
  await expect(this.page.getByText(/rp\s*500\.000\.000/i).first()).toBeVisible()
})
