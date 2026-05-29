/**
 * Shared helpers for time, geography, and flight derivations.
 */
import type { Flight } from "./types"

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
