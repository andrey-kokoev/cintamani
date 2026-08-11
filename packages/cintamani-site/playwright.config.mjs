import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'proposal-visual.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: './output/playwright-results',
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'pnpm run preview:audit',
    url: 'http://127.0.0.1:8787/proposals/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
