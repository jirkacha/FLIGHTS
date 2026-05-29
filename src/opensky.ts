/**
 * OpenSky Network — free live aircraft positions (no API key required).
 * https://openskynetwork.github.io/opensky-api/rest.html
 *
 * Rate limit: anonymous users 400 requests/day, ~10s between requests.
 */

export type LiveAircraft = {
  icao24: string
  callsign?: string
  originCountry?: string
  longitude: number
  latitude: number
  altitudeM?: number
  velocityMs?: number
  headingDeg?: number
  verticalRateMs?: number
  onGround: boolean
}

// Bounding box around Prague (roughly 200km radius)
const BBOX = {
  lamin: 49.0,
  lomin: 13.0,
  lamax: 51.0,
  lomax: 16.5,
}

type RawState = [
  string, // icao24
  string | null, // callsign
  string | null, // origin_country
  number | null, // time_position
  number | null, // last_contact
  number | null, // longitude
  number | null, // latitude
  number | null, // baro_altitude
  boolean, // on_ground
  number | null, // velocity
  number | null, // true_track (heading)
  number | null, // vertical_rate
  number[] | null, // sensors
  number | null, // geo_altitude
  string | null, // squawk
  boolean, // spi
  number, // position_source
]

type OpenSkyResponse = {
  time: number
  states: RawState[] | null
}

export const fetchLiveAircraft = async (): Promise<LiveAircraft[]> => {
  const url = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`OpenSky ${res.status}`)
  }
  const json = (await res.json()) as OpenSkyResponse
  const states = json.states ?? []
  return states
    .filter((s) => s[5] != null && s[6] != null)
    .map<LiveAircraft>((s) => ({
      icao24: s[0],
      callsign: s[1]?.trim() || undefined,
      originCountry: s[2] ?? undefined,
      longitude: s[5] as number,
      latitude: s[6] as number,
      altitudeM: s[7] ?? s[13] ?? undefined,
      velocityMs: s[9] ?? undefined,
      headingDeg: s[10] ?? undefined,
      verticalRateMs: s[11] ?? undefined,
      onGround: s[8],
    }))
}
