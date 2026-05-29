import airportsRaw from "./airports.json"

const airports = airportsRaw as unknown as Record<string, [number, number]>

/**
 * Look up airport coordinates by IATA code. Returns [lat, lon] or null.
 * Data: filtered IATA-coded airports from mwgg/Airports (~7900 entries, ~187KB).
 */
export const getAirportCoords = (iata?: string): [number, number] | null => {
  if (!iata) return null
  return airports[iata.toUpperCase()] ?? null
}
