import type { Flight } from "./types"
import type { LiveAircraft } from "./opensky"

const norm = (s?: string) => (s ?? "").toUpperCase().replace(/[\s\-]/g, "")

const TERMINAL_STATUS = new Set(["Arrived", "Departed", "Cancelled"])

/**
 * Try to match a live ADS-B aircraft with a scheduled flight.
 *
 * IMPORTANT: callsign is *leg-specific* (e.g. LH1234 inbound vs LH1235
 * outbound on the same airframe), registration is *plane-specific* (one
 * aircraft does multiple legs per day). Always try callsign first.
 *
 * Strategy (best → worst):
 *  1. Callsign equals IATA flight number  (e.g. "OK645" ↔ "OK 645")
 *  2. Callsign equals ICAO airline code + number  (e.g. "CSA645" ↔ "OK 645")
 *  3. Registration — when multiple flights share the same airframe, prefer
 *     the active (non-terminal) leg whose effective time is closest to now.
 */
export const matchFlightToAircraft = (
  aircraft: LiveAircraft,
  flights: Flight[],
): Flight | undefined => {
  const callsign = norm(aircraft.callsign)

  if (callsign) {
    const byIata = flights.find((f) => norm(f.number) === callsign)
    if (byIata) return byIata

    const m = callsign.match(/^([A-Z]{3})(\d+[A-Z]?)$/)
    if (m) {
      const [, icao, num] = m
      const byIcao = flights.find(
        (f) => norm(f.airlineIcao) === icao && norm(f.number).endsWith(num),
      )
      if (byIcao) return byIcao
    }
  }

  const reg = norm(aircraft.registration)
  if (!reg) return undefined

  const candidates = flights.filter((f) => norm(f.aircraftReg) === reg)
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]

  // Multiple legs for the same airframe — prefer active legs, then closest in time.
  const active = candidates.filter((f) => !TERMINAL_STATUS.has(f.status))
  const pool = active.length > 0 ? active : candidates
  const now = Date.now()
  return pool.reduce((best, f) => {
    const tb = Math.abs(Date.parse(best.actualTime ?? best.scheduledTime) - now)
    const tf = Math.abs(Date.parse(f.actualTime ?? f.scheduledTime) - now)
    return tf < tb ? f : best
  })
}

export const buildMatchMap = (
  aircrafts: LiveAircraft[],
  flights: Flight[],
): Map<string, Flight> => {
  const map = new Map<string, Flight>()
  for (const a of aircrafts) {
    const f = matchFlightToAircraft(a, flights)
    if (f) map.set(a.icao24, f)
  }
  return map
}
