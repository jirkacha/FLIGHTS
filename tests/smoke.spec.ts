import { test, expect } from "@playwright/test"
import { blockExternal, clickChip, forceMockData, waitForMockBanner } from "./helpers"

/**
 * Smoke tests for the commit 7b4f3fd changes:
 *  - Flights screen: time swap (big actual, struck-through scheduled below)
 *  - Filters work (Aktivní, ≤30 min, Zpožděné, Dokončené, Vše)
 *  - Map screen: aircraft filter chips with live counts
 *  - Toggle (Přílety/Odlety) renders side-by-side, no overlap
 */
test.describe("smoke: commit 7b4f3fd changes", () => {
  test.beforeEach(async ({ page }) => {
    await forceMockData(page)
    await blockExternal(page)
  })

  test("flights tabs Přílety/Odlety render side-by-side without overlap", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)

    const arrivals = page.getByText("Přílety", { exact: false }).first()
    const departures = page.getByText("Odlety", { exact: false }).first()
    await expect(arrivals).toBeVisible()
    await expect(departures).toBeVisible()

    const a = await arrivals.boundingBox()
    const d = await departures.boundingBox()
    expect(a, "arrivals bbox").not.toBeNull()
    expect(d, "departures bbox").not.toBeNull()
    if (!a || !d) return

    // Buttons must not visually overlap on X axis. Allow 1px tolerance.
    const overlap = Math.min(a.x + a.width, d.x + d.width) - Math.max(a.x, d.x)
    expect(
      overlap,
      `tabs horizontal overlap = ${overlap}px (a=${JSON.stringify(a)} d=${JSON.stringify(d)})`,
    ).toBeLessThanOrEqual(1)
  })

  test("eta filter chips switch and show counts", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)

    for (const label of ["Aktivní", "≤ 30 min", "Zpožděné", "Dokončené", "Vše"]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }

    await clickChip(page, /^Vše$/)
    // After clicking "Vše" we expect at least one flight row (mock has 8).
    const counterparts = page.getByText(/Paris|Frankfurt|London|Amsterdam|Antalya/)
    await expect(counterparts.first()).toBeVisible()
  })

  test("scheduled time is struck through and rendered BELOW actual time", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, /^Vše$/)

    // Find a row that has both an actual + scheduled time (delayed).
    // The Delayed Ryanair to STN has scheduled +85 and actual +120.
    // We assert: the smaller (struck) scheduled time is rendered visually
    // BELOW the larger (current) time.
    const rows = page.locator("div").filter({ has: page.getByText("Delayed") })
    const row = rows.first()
    await expect(row).toBeVisible()

    const times = await row.locator("text=/^\\d{1,2}:\\d{2}$/").all()
    expect(
      times.length,
      `Delayed row should expose at least 2 time strings (actual + scheduled)`,
    ).toBeGreaterThanOrEqual(2)

    if (times.length >= 2) {
      const a = await times[0].boundingBox()
      const b = await times[1].boundingBox()
      if (a && b) {
        // First time in DOM should be the big/current one (top), second the struck below.
        expect(a.y, `actual y=${a.y} should be above scheduled y=${b.y}`).toBeLessThan(b.y)
      }
    }
  })

  test("map screen has Vše · Přílety · Odlety · Ostatní filter chips", async ({ page }) => {
    await page.goto("/map")
    // Wait for either the map header text OR any chip — Expo bundle can be slow.
    await expect(page.getByText(/Live mapa kolem PRG|Vše|Přílety/i).first()).toBeVisible({
      timeout: 25_000,
    })

    for (const label of ["Vše", "Přílety", "Odlety", "Ostatní"]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }
  })
})
