import type { Flight } from "./types"
import type { LiveAircraft } from "./opensky"

const norm = (s?: string) => (s ?? "").toUpperCase().replace(/[\s\-]/g, "")

/**
 * Try to match a live ADS-B aircraft with a scheduled flight.
 *
 * Strategy (best → worst):
 *  1. registration match (rare — AeroDataBox doesn't always have it)
 *  2. callsign equals IATA flight number (e.g. "OK645" ↔ "OK 645")
 *  3. callsign equals ICAO airline code + number (e.g. "CSA645" ↔ ICAO "CSA" + "645")
 */
export const matchFlightToAircraft = (
  aircraft: LiveAircraft,
  flights: Flight[],
): Flight | undefined => {
  const reg = norm(aircraft.registration)
  if (reg) {
    const byReg = flights.find((f) => norm(f.aircraftReg) === reg)
    if (byReg) return byReg
  }

  const callsign = norm(aircraft.callsign)
  if (!callsign) return undefined

  // IATA: e.g. "OK 645" → "OK645"
  const byIata = flights.find((f) => norm(f.number) === callsign)
  if (byIata) return byIata

  // ICAO airline: e.g. CSA645 — extract trailing digits
  const m = callsign.match(/^([A-Z]{3})(\d+[A-Z]?)$/)
  if (m) {
    const [, icao, num] = m
    const byIcao = flights.find(
      (f) => norm(f.airlineIcao) === icao && norm(f.number).endsWith(num),
    )
    if (byIcao) return byIcao
  }

  return undefined
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
