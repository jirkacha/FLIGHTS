import { test, expect } from "@playwright/test"
import { blockExternal, clickChip, forceMockData, waitForMockBanner } from "./helpers"

/**
 * Regression tests for the bugs visible in the screenshots:
 *  1. Detail map card: status "Arrived" must NOT also show "Ve vzduchu" live data.
 *  2. Today's flights must NOT render a date (e.g. "29. 05.") — date only when
 *     it's not today (yesterday / tomorrow / a far-away day).
 *  3. The banner "Vybraný let není v ADS-B dosahu" implies no marker for that
 *     flight is drawn on the map.
 *  4. The ETA pill must only appear for flights within the ≤30 min window
 *     (per commit message wording).
 *  5. API error (429) must not blank the screen — mock fallback kicks in.
 */
test.describe("regression: bugs from screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await forceMockData(page)
    await blockExternal(page)
  })

  test("bug #5 — 429 from AeroDataBox falls back to mock, never blanks the board", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, /^Vše$/)
    // The empty-state message must NOT be the dominant state.
    await expect(page.getByText("Žádné lety pro tento filtr")).not.toBeVisible()
  })

  test("bug #3 — today's flight does NOT render a date stamp like '29. 05.'", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, /^Vše$/)

    // All MOCK_FLIGHTS are scheduled relative to NOW => all "today".
    // No standalone DD. MM. date stamp should appear in any row.
    const dateLike = page.locator("text=/^\\s*\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*$/")
    const count = await dateLike.count()
    expect(
      count,
      `expected 0 standalone date stamps for today's flights, got ${count}`,
    ).toBe(0)
  })

  test("bug #4 — 'za N min' pill only appears for flights ≤ 30 min away", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, /^Vše$/)

    const pills = page.locator("text=/^za\\s+\\d+\\s+min$/")
    const texts = await pills.allTextContents()
    for (const t of texts) {
      const m = t.match(/za\s+(\d+)\s+min/)
      expect(m, `pill text "${t}" should match`).not.toBeNull()
      if (m) {
        const min = Number(m[1])
        expect(min, `pill shows ${min} min — must be ≤ 30`).toBeLessThanOrEqual(30)
      }
    }
  })

  test("bug #1 — flight detail must not contradict Arrived status with airborne live data", async ({ page }) => {
    await page.goto("/")
    await waitForMockBanner(page)
    await clickChip(page, /^Dokončené$/)

    const arrivedBadge = page.getByText(/^Arrived$/).first()
    if (!(await arrivedBadge.isVisible().catch(() => false))) {
      test.skip(true, "no Arrived flight visible — cannot exercise bug #1")
    }
    // Click the row of the Arrived flight by going to its "Detail letu" button.
    await page.getByText("Detail letu", { exact: false }).first().click()

    // On the detail screen, an Arrived flight must not advertise airborne data.
    await expect(page.getByText(/Ve vzduchu/i)).toHaveCount(0)
    // Altitude / fl text should also be hidden — accept both "35,000 ft" and "10 668 m".
    await expect(page.getByText(/\b\d{2}[,. ]?\d{3}\s*ft\b/)).toHaveCount(0)
  })

  test("bug #2 — banner 'Vybraný let není v ADS-B dosahu' implies no airplane marker popup", async ({ page }) => {
    await page.goto("/map")
    // Best-effort: only assert if banner happens to be visible in current state.
    const banner = page.getByText(/Vybraný let není v ADS-B dosahu/i)
    if (!(await banner.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "banner not visible — cannot exercise bug #2")
    }
    const popup = page.locator(".leaflet-popup")
    await expect(
      popup,
      "no leaflet popup should be open while banner says ADS-B unavailable",
    ).toHaveCount(0)
  })
})
