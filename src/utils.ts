/**
 * Shared helpers for time, geography, and flight derivations.
 */
import type { Flight } from "./types"
import type { LiveAircraft } from "./opensky"
import { getAirportCoords } from "./airports"

export const PRG_COORDS: [number, number] = [50.1008, 14.26]

const toRad = (x: number) => (x * Math.PI) / 180
const toDeg = (x: number) => (x * 180) / Math.PI

/** Initial bearing (degrees, 0 = north, clockwise) from point A to point B. */
export const bearingDeg = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

/** Effective (best-known) time for sorting / ETA — actual if known, otherwise scheduled. */
export const effectiveTime = (f: Flight): string => f.actualTime ?? f.scheduledTime

/** Delay in minutes (positive = late). 0 when no actual time is known. */
export const delayMinutes = (f: Flight): number => {
  if (!f.actualTime) return 0
  const s = Date.parse(f.scheduledTime)
  const a = Date.parse(f.actualTime)
  if (Number.isNaN(s) || Number.isNaN(a)) return 0
  return Math.round((a - s) / 60_000)
}

export const minutesUntil = (iso: string): number => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.round((t - Date.now()) / 60_000)
}

export const fmtTime = (iso?: string): string => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

/** "29. 05." — short Czech-style day/month, no year. */
export const fmtDateShort = (iso?: string): string => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getDate()}. ${String(d.getMonth() + 1).padStart(2, "0")}.`
}

/**
 * Returns "dnes" / "zítra" / "29. 5." — null when the date is today, so callers
 * can render it only when meaningful.
 */
export const fmtDateRelative = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return null
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (sameDay(d, tomorrow)) return "zítra"
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(d, yesterday)) return "včera"
  return `${d.getDate()}. ${d.getMonth() + 1}.`
}

/** Format minute count as "+1 h 25 min" / "+25 min". */
export const fmtDelay = (min: number): string => {
  const sign = min < 0 ? "−" : "+"
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${sign}${m} min`
  if (m === 0) return `${sign}${h} h`
  return `${sign}${h} h ${m} min`
}

export const isTerminalStatus = (f: Flight): boolean =>
  f.status === "Arrived" || f.status === "Departed" || f.status === "Cancelled"

// --- Aircraft size classification ------------------------------------------------

export type AircraftCategory = "small" | "medium" | "wide" | "jumbo" | "cargo" | "unknown"

const RX_SMALL =
  /\bATR\b|\bDHC\b|\bDash\b|\bSaab\b|\bCRJ\b|\bERJ\b|\bE-?(135|140|145|170|175)\b|\bBeech\b|\bCessna\b|\bPilatus\b|\bSF\b|\bJ4\b/i
const RX_MEDIUM =
  /\b737\b|7M[0-9]|\bA31[89]\b|\bA320\b|\bA321\b|\bA220\b|\b717\b|\b757\b|MD-?(80|90)\b|\bE19[05]\b/i
const RX_WIDE = /\bA330\b|\bA340\b|\bA350\b|\b767\b|\b777\b|\b787\b|MD-?11\b|IL-?96\b/i
const RX_JUMBO = /\bA380\b|\b747\b/i
const RX_FREIGHTER = /\bF\b|Freighter|Cargo/i

const CARGO_AIRLINE_IATA = new Set(["FX", "5X", "5Y", "CK", "CV", "GW", "HLF", "X3", "RH", "MP", "QY"])
const CARGO_AIRLINE_ICAO = new Set(["FDX", "UPS", "GTI", "CKK", "CLX", "BOX", "HLF", "DHK", "DHX", "BCS"])

export const aircraftCategory = (
  model?: string,
  airlineIata?: string,
  airlineIcao?: string,
): AircraftCategory => {
  if (airlineIata && CARGO_AIRLINE_IATA.has(airlineIata.toUpperCase())) return "cargo"
  if (airlineIcao && CARGO_AIRLINE_ICAO.has(airlineIcao.toUpperCase())) return "cargo"
  if (model && RX_FREIGHTER.test(model)) return "cargo"
  if (model) {
    if (RX_JUMBO.test(model)) return "jumbo"
    if (RX_WIDE.test(model)) return "wide"
    if (RX_MEDIUM.test(model)) return "medium"
    if (RX_SMALL.test(model)) return "small"
  }
  return "unknown"
}

const SIZE_BY_CATEGORY: Record<AircraftCategory, number> = {
  small: 14,
  medium: 18,
  wide: 26,
  jumbo: 32,
  cargo: 20,
  unknown: 16,
}

export const aircraftIconSize = (cat: AircraftCategory): number => SIZE_BY_CATEGORY[cat]

const LABEL_BY_CATEGORY: Record<AircraftCategory, string> = {
  small: "Regionální",
  medium: "Středně velký",
  wide: "Široký trup",
  jumbo: "Jumbo",
  cargo: "Cargo",
  unknown: "Neznámý",
}

export const aircraftCategoryLabel = (cat: AircraftCategory): string => LABEL_BY_CATEGORY[cat]

// --- Flight duration ------------------------------------------------------------

const CRUISE_KMH = 850
const OVERHEAD_MIN = 30

/** Rough flight duration in minutes from great-circle distance. */
export const estimateDurationMin = (distanceKm: number): number =>
  Math.round((distanceKm / CRUISE_KMH) * 60) + OVERHEAD_MIN

/** Human-readable duration: "3 h 45 min" / "45 min". */
export const fmtDuration = (min: number): string => {
  if (!Number.isFinite(min) || min <= 0) return "—"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/**
 * Flight progress (0..1) along the great-circle route between the counterpart
 * airport and PRG. Combines live ADS-B position (when available) with a
 * time-based fallback derived from the estimated cruise duration.
 *
 * Returns null when the route cannot be located.
 */
export const flightProgress = (f: Flight, live?: LiveAircraft | null): number | null => {
  if (f.status === "Arrived" || f.status === "Departed") return 1
  if (f.status === "Cancelled") return 0

  const counter = getAirportCoords(f.counterpart.iata)
  if (!counter) return null
  const totalKm = haversineKm(counter[0], counter[1], PRG_COORDS[0], PRG_COORDS[1])
  if (totalKm <= 0) return null

  // Prefer live distance for currently airborne flights.
  if (live && !live.onGround) {
    const fromPrg = haversineKm(live.latitude, live.longitude, PRG_COORDS[0], PRG_COORDS[1])
    const fromOrigin = haversineKm(live.latitude, live.longitude, counter[0], counter[1])
    if (f.direction === "arrival") {
      return clamp01(fromOrigin / (fromOrigin + fromPrg))
    }
    return clamp01(fromPrg / (fromPrg + fromOrigin))
  }

  // Time-based fallback: linear from estimated departure to effective arrival.
  const durMin = estimateDurationMin(totalKm)
  const ref = Date.parse(effectiveTime(f))
  if (Number.isNaN(ref)) return null
  const arrMs = f.direction === "arrival" ? ref : ref + durMin * 60_000
  const depMs = f.direction === "arrival" ? ref - durMin * 60_000 : ref
  const now = Date.now()
  if (now <= depMs) return 0
  if (now >= arrMs) return 1
  return clamp01((now - depMs) / (arrMs - depMs))
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
