import type { Flight, FlightDirection } from "./types"
import { MOCK_FLIGHTS } from "./mockData"
import { effectiveTime } from "./utils"

const RAPIDAPI_KEY = process.env.EXPO_PUBLIC_RAPIDAPI_KEY ?? ""
const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === "1"
const HOST = "aerodatabox.p.rapidapi.com"
const AIRPORT_IATA = "PRG"
const CACHE_TTL_MS = 5 * 60_000 // 5 min — arrivals/departures change slowly

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

// Persisted cache survives full reloads so the user doesn't burn one AeroDataBox
// quota unit per tab-open. Without this a 1500/month BASIC plan is exhausted by
// a single dev's idle browsing in days.
const LS_KEY = "prg-flights:flightCache:v1"

const loadPersistedCache = (): CacheEntry | null => {
  if (typeof window === "undefined" || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (typeof entry?.ts !== "number") return null
    return entry
  } catch {
    return null
  }
}

const persistCache = (entry: CacheEntry) => {
  if (typeof window === "undefined" || !window.localStorage) return
  // Mock results aren't worth persisting — they're regenerated cheaply and
  // would shadow a real recovery on the next reload.
  if (entry.isMock) return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(entry))
  } catch {
    // Quota / private mode — ignore.
  }
}

// Hydrate from localStorage at module init so the very first call after reload
// can satisfy from cache without touching the network.
cache = loadPersistedCache()

const mockEntry = (): CacheEntry => ({
  ts: Date.now(),
  arrivals: MOCK_FLIGHTS.filter((f) => f.direction === "arrival"),
  departures: MOCK_FLIGHTS.filter((f) => f.direction === "departure"),
  isMock: true,
})

const fetchAll = async (): Promise<CacheEntry> => {
  if (USE_MOCK || !RAPIDAPI_KEY) {
    return mockEntry()
  }
  const now = new Date()
  // AeroDataBox allows max 12h window. Bias toward the future so upcoming
  // arrivals are visible far in advance, while still keeping a -4h tail
  // so long-delayed inbound flights don't disappear.
  const from = fmt(new Date(now.getTime() - 4 * 3600 * 1000))
  const to = fmt(new Date(now.getTime() + 8 * 3600 * 1000))
  const url = `https://${HOST}/flights/airports/iata/${AIRPORT_IATA}/${from}/${to}?direction=Both&withCancelled=true&withCodeshared=false&withCargo=true&withPrivate=false&withLocation=false`
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": HOST },
  })
  if (!res.ok) {
    // Quota exhaustion / rate-limiting must not blank the board. Fall back to
    // mock data so the UI stays usable, and let the screen surface a soft
    // warning via the existing `isMock` banner.
    if (res.status === 429 || res.status === 402 || res.status === 403) {
      console.warn(`AeroDataBox ${res.status} — falling back to mock data`)
      return mockEntry()
    }
    throw new Error(`AeroDataBox ${res.status}: ${await res.text().catch(() => "")}`)
  }
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
      persistCache(entry)
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
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(LS_KEY)
    } catch {
      // ignore
    }
  }
}
