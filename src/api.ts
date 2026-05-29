import type { Flight, FlightDirection } from "./types"
import { MOCK_FLIGHTS } from "./mockData"

/**
 * AeroDataBox via RapidAPI:
 *   GET https://aerodatabox.p.rapidapi.com/flights/airports/iata/PRG/{from}/{to}
 *   Headers: X-RapidAPI-Key, X-RapidAPI-Host
 *
 * Register a free key (500 req/month) at:
 *   https://rapidapi.com/aedbx-aedbx/api/aerodatabox
 *
 * Then create a `.env` file (see .env.example) with EXPO_PUBLIC_RAPIDAPI_KEY=...
 */

const RAPIDAPI_KEY = process.env.EXPO_PUBLIC_RAPIDAPI_KEY ?? ""
const HOST = "aerodatabox.p.rapidapi.com"
const AIRPORT_IATA = "PRG"

const pad = (n: number) => n.toString().padStart(2, "0")
const fmt = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

type ApiMovement = {
  movement: {
    airport: { iata?: string; name?: string; municipalityName?: string; countryCode?: string }
    scheduledTime?: { utc?: string; local?: string }
    revisedTime?: { utc?: string; local?: string }
    actualTime?: { utc?: string; local?: string }
    terminal?: string
    gate?: string
    quality?: string[]
  }
  number: string
  callSign?: string
  status?: string
  codeshareStatus?: string
  isCargo?: boolean
  aircraft?: { reg?: string; modeS?: string; model?: string }
  airline?: { name?: string; iata?: string; icao?: string }
}

type ApiResponse = {
  departures?: ApiMovement[]
  arrivals?: ApiMovement[]
}

const mapStatus = (s?: string): Flight["status"] => {
  if (!s) return "Unknown"
  const x = s.toLowerCase()
  if (x.includes("cancel")) return "Cancelled"
  if (x.includes("delay")) return "Delayed"
  if (x.includes("board")) return "Boarding"
  if (x.includes("depart")) return "Departed"
  if (x.includes("arriv")) return "Arrived"
  if (x.includes("en route") || x.includes("enroute")) return "EnRoute"
  if (x.includes("schedul") || x.includes("expected")) return "Scheduled"
  return "Unknown"
}

const mapMovement = (m: ApiMovement, direction: FlightDirection): Flight => ({
  id: `${m.number}-${m.movement.scheduledTime?.utc ?? Math.random()}`,
  number: m.number,
  airlineName: m.airline?.name ?? "—",
  airlineIata: m.airline?.iata,
  direction,
  counterpart: {
    name: m.movement.airport?.name ?? "—",
    iata: m.movement.airport?.iata,
    city: m.movement.airport?.municipalityName,
    countryCode: m.movement.airport?.countryCode,
  },
  scheduledTime:
    m.movement.scheduledTime?.utc ?? m.movement.scheduledTime?.local ?? new Date().toISOString(),
  actualTime: m.movement.actualTime?.utc ?? m.movement.revisedTime?.utc,
  status: mapStatus(m.status),
  terminal: m.movement.terminal,
  gate: m.movement.gate,
  aircraftModel: m.aircraft?.model,
  aircraftReg: m.aircraft?.reg,
})

export const fetchFlights = async (
  direction: FlightDirection,
): Promise<{ flights: Flight[]; isMock: boolean }> => {
  if (!RAPIDAPI_KEY) {
    // Dev fallback: return mock data
    return {
      flights: MOCK_FLIGHTS.filter((f) => f.direction === direction),
      isMock: true,
    }
  }

  // AeroDataBox accepts a 12h window per call
  const now = new Date()
  const fromDate = new Date(now.getTime() - 2 * 3600 * 1000)
  const toDate = new Date(now.getTime() + 10 * 3600 * 1000)
  const from = fmt(fromDate)
  const to = fmt(toDate)

  const url = `https://${HOST}/flights/airports/iata/${AIRPORT_IATA}/${from}/${to}?direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`

  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": RAPIDAPI_KEY,
      "X-RapidAPI-Host": HOST,
    },
  })
  if (!res.ok) {
    throw new Error(`AeroDataBox ${res.status}: ${await res.text().catch(() => "")}`)
  }
  const json = (await res.json()) as ApiResponse
  const source = direction === "arrival" ? json.arrivals : json.departures
  const flights = (source ?? []).map((m) => mapMovement(m, direction))
  flights.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
  return { flights, isMock: false }
}
