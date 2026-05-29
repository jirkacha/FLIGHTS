/**
 * Live ADS-B aircraft data — community-aggregated feeds.
 * Free, no API key, CORS-enabled.
 *
 * Primary:   https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}
 * Fallback:  https://api.airplanes.live/v2/point/{lat}/{lon}/{radius_nm}
 */

export type LiveAircraft = {
  icao24: string
  callsign?: string
  registration?: string
  aircraftType?: string
  description?: string
  longitude: number
  latitude: number
  altitudeFt?: number
  groundSpeedKt?: number
  headingDeg?: number
  verticalRateFpm?: number
  onGround: boolean
  squawk?: string
  ageSec?: number
}

const PRG_LAT = 50.1008
const PRG_LON = 14.26
const RADIUS_NM = 100 // ~185 km

type RawAircraft = {
  hex: string
  flight?: string
  r?: string
  t?: string
  desc?: string
  alt_baro?: number | "ground"
  alt_geom?: number
  gs?: number
  track?: number
  true_heading?: number
  mag_heading?: number
  baro_rate?: number
  squawk?: string
  lat?: number
  lon?: number
  seen_pos?: number
}

const mapAircraft = (a: RawAircraft): LiveAircraft | null => {
  if (a.lat == null || a.lon == null) return null
  const onGround = a.alt_baro === "ground"
  return {
    icao24: a.hex,
    callsign: a.flight?.trim() || undefined,
    registration: a.r,
    aircraftType: a.t,
    description: a.desc,
    longitude: a.lon,
    latitude: a.lat,
    altitudeFt: typeof a.alt_baro === "number" ? a.alt_baro : a.alt_geom,
    groundSpeedKt: a.gs,
    headingDeg: a.track ?? a.true_heading ?? a.mag_heading,
    verticalRateFpm: a.baro_rate,
    onGround,
    squawk: a.squawk,
    ageSec: a.seen_pos,
  }
}

const tryFetch = async (url: string, signal: AbortSignal): Promise<LiveAircraft[]> => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const json = (await res.json()) as { ac?: RawAircraft[]; aircraft?: RawAircraft[] }
  const list = json.ac ?? json.aircraft ?? []
  return list.map(mapAircraft).filter((x): x is LiveAircraft => x !== null)
}

const PER_SOURCE_TIMEOUT_MS = 5000

export const fetchLiveAircraft = async (): Promise<LiveAircraft[]> => {
  const sources = [
    `https://api.adsb.lol/v2/point/${PRG_LAT}/${PRG_LON}/${RADIUS_NM}`,
    `https://api.airplanes.live/v2/point/${PRG_LAT}/${PRG_LON}/${RADIUS_NM}`,
  ]
  let lastErr: unknown
  for (const url of sources) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_SOURCE_TIMEOUT_MS)
    try {
      return await tryFetch(url, controller.signal)
    } catch (e) {
      lastErr = e
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All ADS-B sources failed or timed out")
}
