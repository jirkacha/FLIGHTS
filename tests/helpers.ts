import { Page, Route, expect } from "@playwright/test"

/**
 * Intercepts the AeroDataBox endpoint and replies with `responseStatus` so the
 * app falls back to MOCK_FLIGHTS (see src/api.ts — 429/402/403 trigger fallback).
 * Returning 429 is the most realistic scenario (the user is hitting it in prod).
 */
export const forceMockData = async (page: Page, responseStatus = 429) => {
  await page.route("**/aerodatabox.p.rapidapi.com/**", (route: Route) =>
    route.fulfill({
      status: responseStatus,
      contentType: "application/json",
      body: JSON.stringify({ message: "forced mock fallback by playwright" }),
    }),
  )
}

/**
 * Block external tile providers and OpenSky/Planespotters so map tests don't
 * depend on network. We don't render the tile content in assertions anyway.
 */
export const blockExternal = async (page: Page) => {
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort())
  await page.route("**/opensky-network.org/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ states: [] }) }),
  )
  await page.route("**/api.planespotters.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  )
}

/**
 * Wait until the mock-data warning banner shows up — that's our signal that the
 * app has finished its first fetch cycle and rendered fallback flights.
 */
export const waitForMockBanner = async (page: Page) => {
  await expect(page.getByText(/Ukázková data/i)).toBeVisible({ timeout: 20_000 })
}

/**
 * Locate a clickable "chip-like" element by its visible label text. RN-Web
 * Pressable does NOT set role=button unless accessibilityRole is explicit, so
 * we resolve by text and walk up to the nearest interactive ancestor.
 *
 * For a single label like "Vše" or "Aktivní", returns the inner <div> with the
 * label — clicking it bubbles up to the Pressable handler.
 */
export const clickChip = async (page: Page, label: string | RegExp) => {
  const el = page.getByText(label, { exact: false }).first()
  await el.scrollIntoViewIfNeeded()
  await el.click()
}
