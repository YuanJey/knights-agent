import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const localChromium = resolve(
  '.playwright-browsers/chrome-headless-shell-mac-arm64/chrome-headless-shell',
)

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    launchOptions: existsSync(localChromium)
      ? { executablePath: localChromium }
      : undefined,
  },
  webServer: [
    {
      command:
        'NODE_ENV=test LOG_LEVEL=silent node dist-server/server/index.js',
      url: 'http://127.0.0.1:8787/readyz',
      reuseExistingServer: true,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
})
