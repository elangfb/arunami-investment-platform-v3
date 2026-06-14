import { After, AfterAll, Before, BeforeAll, setDefaultTimeout, setWorldConstructor, World, type IWorldOptions, Status } from '@cucumber/cucumber'
import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { disconnect, resetScenarioState } from './db'

// Process management (Postgres reset, Firebase emulator, Next server, stub env) lives in
// scripts/test-e2e.sh — this file ONLY runs the browser against an already-running stack.
// PLAYWRIGHT_BASE_URL is set by the harness (defaults to localhost:4200 for dev convenience).
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200'
const reportsDir = join(process.cwd(), 'apps/web-app-e2e/reports')

let browser: Browser | null = null

setDefaultTimeout(60_000)

async function waitForServer(url: string) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) return
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}. Did scripts/test-e2e.sh boot the stack?`)
}

export class MizanWorld extends World {
  context!: BrowserContext
  page!: Page
  applicationName = ''
  fixtureAppId = ''

  constructor(options: IWorldOptions) {
    super(options)
  }

  async expectVisibleText(text: string | RegExp) {
    await expect(this.page.getByText(text)).toBeVisible()
  }
}

setWorldConstructor(MizanWorld)

BeforeAll(async function () {
  await waitForServer(baseURL)
  browser = await chromium.launch()
})

Before(async function (this: MizanWorld, { pickle }) {
  await resetScenarioState()
  this.context = await browser!.newContext({ baseURL })
  await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true, title: pickle.name })
  this.page = await this.context.newPage()
})

After(async function (this: MizanWorld, { pickle, result }) {
  const failed = result?.status === Status.FAILED
  if (failed) {
    const safe = pickle.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const tracePath = join(reportsDir, 'traces', `${safe}.zip`)
    await mkdir(dirname(tracePath), { recursive: true })
    await this.context.tracing.stop({ path: tracePath })
    const screenshot = await this.page.screenshot({ fullPage: true }).catch(() => null)
    if (screenshot) await this.attach(screenshot, 'image/png')
    await this.attach(`Playwright trace: ${tracePath}\n  view: npx playwright show-trace ${tracePath}`, 'text/plain')
  } else {
    await this.context.tracing.stop()
  }
  await this.context?.close()
})

AfterAll(async function () {
  await browser?.close()
  browser = null
  await disconnect()
})
