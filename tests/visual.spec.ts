import { test } from "@playwright/test"
import { blockExternal, clickChip, forceMockData, waitForMockBanner } from "./helpers"

/**
 * Visual snapshots — diagnostic PNGs to test-results/visual/ each run.
 * Manual eyeball comparison; no baseline workflow.
 */
test.describe("visual snapshots", () => {
  test.beforeEach(async ({ page }) => {
    await forceMockData(page)
    await blockExternal(page)
  })

  test("flights screen — Vše tab", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, /^Vše$/)
    await page.screenshot({ path: "test-results/visual/flights-vse.png", fullPage: true })
  })

  test("flights screen — Přílety / Aktivní (default landing)", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await page.screenshot({ path: "test-results/visual/flights-default.png", fullPage: true })
  })

  test("flights screen — Odlety", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, "Odlety")
    await page.waitForTimeout(300)
    await page.screenshot({ path: "test-results/visual/flights-odlety.png", fullPage: true })
  })

  test("map screen — default", async ({ page }) => {
    await page.goto("/map")
    await page.waitForTimeout(1500)
    await page.screenshot({ path: "test-results/visual/map-default.png", fullPage: true })
  })

  test("map screen — Přílety filter", async ({ page }) => {
    await page.goto("/map")
    await page.waitForTimeout(1000)
    await clickChip(page, "Přílety")
    await page.waitForTimeout(300)
    await page.screenshot({ path: "test-results/visual/map-prilety.png", fullPage: true })
  })
})
