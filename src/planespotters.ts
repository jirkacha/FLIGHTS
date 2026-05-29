/**
 * Aircraft photos from Planespotters.net free public API.
 * No API key, CORS-enabled. Lookup by registration (e.g. "OK-XYZ")
 * or by ICAO24 hex (e.g. "49d2e8").
 *
 * Docs: https://www.planespotters.net/photo/api
 */

export type AircraftPhoto = {
  thumbnail: string
  large: string
  photographer?: string
  link?: string
}

type RawPhoto = {
  id: string
  thumbnail?: { src: string }
  thumbnail_large?: { src: string }
  photographer?: string
  link?: string
}

type RawResponse = { photos?: RawPhoto[] }

const cache = new Map<string, AircraftPhoto | null>()

const parse = (json: RawResponse): AircraftPhoto | null => {
  const p = json.photos?.[0]
  if (!p) return null
  return {
    thumbnail: p.thumbnail?.src ?? p.thumbnail_large?.src ?? "",
    large: p.thumbnail_large?.src ?? p.thumbnail?.src ?? "",
    photographer: p.photographer,
    link: p.link,
  }
}

const fetchOne = async (url: string, cacheKey: string): Promise<AircraftPhoto | null> => {
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null
  try {
    const res = await fetch(url)
    if (!res.ok) {
      cache.set(cacheKey, null)
      return null
    }
    const photo = parse((await res.json()) as RawResponse)
    cache.set(cacheKey, photo)
    return photo
  } catch {
    cache.set(cacheKey, null)
    return null
  }
}

/**
 * Try registration first, then ICAO24 hex as fallback. Both lookups are cached.
 */
export const fetchAircraftPhoto = async (
  registration?: string,
  icao24?: string,
): Promise<AircraftPhoto | null> => {
  if (registration) {
    const key = `reg:${registration.toUpperCase().trim()}`
    const url = `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(
      registration.toUpperCase().trim(),
    )}`
    const hit = await fetchOne(url, key)
    if (hit) return hit
  }
  if (icao24) {
    const key = `hex:${icao24.toLowerCase().trim()}`
    const url = `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(
      icao24.toLowerCase().trim(),
    )}`
    const hit = await fetchOne(url, key)
    if (hit) return hit
  }
  return null
}
