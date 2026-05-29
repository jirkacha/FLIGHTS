/**
 * Aircraft photos from Planespotters.net free public API.
 * No API key, CORS-enabled. Lookup by registration (e.g. "OK-XYZ").
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

export const fetchAircraftPhoto = async (registration?: string): Promise<AircraftPhoto | null> => {
  if (!registration) return null
  const key = registration.toUpperCase().trim()
  if (cache.has(key)) return cache.get(key) ?? null
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(key)}`)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const json = (await res.json()) as RawResponse
    const p = json.photos?.[0]
    if (!p) {
      cache.set(key, null)
      return null
    }
    const photo: AircraftPhoto = {
      thumbnail: p.thumbnail?.src ?? p.thumbnail_large?.src ?? "",
      large: p.thumbnail_large?.src ?? p.thumbnail?.src ?? "",
      photographer: p.photographer,
      link: p.link,
    }
    cache.set(key, photo)
    return photo
  } catch {
    cache.set(key, null)
    return null
  }
}
