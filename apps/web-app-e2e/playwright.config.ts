import { defineConfig } from '@playwright/test'

// This file is not consumed by `cucumber-js` directly — the suite runs through Cucumber
// (cucumber.cjs). It exists so we can:
//   • `npx playwright show-trace apps/web-app-e2e/reports/trace.zip` after a failure
//   • share one source of truth for baseURL + viewport between Cucumber steps and any
//     future raw-Playwright spec
//   • run `npx playwright codegen $BASE_URL` against the same baseURL the suite uses
//
// Cucumber's `support/world.ts` reads PLAYWRIGHT_BASE_URL with the same default.
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
