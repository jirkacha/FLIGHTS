import type { Flight, FlightDirection } from "./types"
import { MOCK_FLIGHTS } from "./mockData"
import { effectiveTime } from "./utils"

const RAPIDAPI_KEY = process.env.EXPO_PUBLIC_RAPIDAPI_KEY ?? ""
const HOST = "aerodatabox.p.rapidapi.com"
const AIRPORT_IATA = "PRG"
const CACHE_TTL_MS = 60_000

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
  }
  number: string
  status?: string
  aircraft?: { reg?: string; modeS?: string; model?: string }
  airline?: { name?: string; iata?: string; icao?: string }
}

type ApiResponse = { departures?: ApiMovement[]; arrivals?: ApiMovement[] }

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
  airlineIcao: m.airline?.icao,
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

type CacheEntry = { ts: number; arrivals: Flight[]; departures: Flight[]; isMock: boolean }
let cache: CacheEntry | null = null
let inflight: Promise<CacheEntry> | null = null

const fetchAll = async (): Promise<CacheEntry> => {
  if (!RAPIDAPI_KEY) {
    return {
      ts: Date.now(),
      arrivals: MOCK_FLIGHTS.filter((f) => f.direction === "arrival"),
      departures: MOCK_FLIGHTS.filter((f) => f.direction === "departure"),
      isMock: true,
    }
  }
  const now = new Date()
  // AeroDataBox allows max 12h window. Bias toward the past so long-delayed
  // inbound flights (whose scheduled time is hours ago) still come back.
  const from = fmt(new Date(now.getTime() - 8 * 3600 * 1000))
  const to = fmt(new Date(now.getTime() + 4 * 3600 * 1000))
  const url = `https://${HOST}/flights/airports/iata/${AIRPORT_IATA}/${from}/${to}?direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": HOST },
  })
  if (!res.ok) throw new Error(`AeroDataBox ${res.status}: ${await res.text().catch(() => "")}`)
  const json = (await res.json()) as ApiResponse
  const sortByEffective = (a: Flight, b: Flight) =>
    effectiveTime(a).localeCompare(effectiveTime(b))
  const arrivals = (json.arrivals ?? []).map((m) => mapMovement(m, "arrival")).sort(sortByEffective)
  const departures = (json.departures ?? [])
    .map((m) => mapMovement(m, "departure"))
    .sort(sortByEffective)
  return { ts: Date.now(), arrivals, departures, isMock: false }
}

const getAll = async (force = false): Promise<CacheEntry> => {
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache
  if (inflight) return inflight
  inflight = fetchAll()
    .then((entry) => {
      cache = entry
      return entry
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export const fetchFlights = async (
  direction: FlightDirection,
): Promise<{ flights: Flight[]; isMock: boolean }> => {
  const entry = await getAll()
  return {
    flights: direction === "arrival" ? entry.arrivals : entry.departures,
    isMock: entry.isMock,
  }
}

export const fetchAllFlights = async (force = false): Promise<{
  arrivals: Flight[]
  departures: Flight[]
  isMock: boolean
}> => {
  const entry = await getAll(force)
  return { arrivals: entry.arrivals, departures: entry.departures, isMock: entry.isMock }
}

export const invalidateFlightCache = () => {
  cache = null
}
