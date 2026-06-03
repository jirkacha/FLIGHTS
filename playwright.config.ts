import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for prg-flights.
 *
 * Tests assume the Expo web dev server is already running at PLAYWRIGHT_BASE_URL
 * (default http://localhost:8081). Start it with `npm run web` in a separate shell.
 *
 * Network-deterministic tests intercept the AeroDataBox endpoint and force the
 * 429 fallback path, which makes the app render MOCK_FLIGHTS regardless of the
 * real RAPIDAPI key state.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // app uses module-level cache; serial runs are safer
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  outputDir: "test-results",
})
