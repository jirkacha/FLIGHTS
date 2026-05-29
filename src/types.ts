export type FlightDirection = "arrival" | "departure"

export type FlightStatus =
  | "Scheduled"
  | "EnRoute"
  | "Boarding"
  | "Departed"
  | "Arrived"
  | "Delayed"
  | "Cancelled"
  | "Unknown"

export type Flight = {
  id: string
  number: string
  airlineName: string
  airlineIata?: string
  airlineIcao?: string
  direction: FlightDirection
  /** Counterpart airport (origin for arrivals, destination for departures) */
  counterpart: {
    name: string
    iata?: string
    city?: string
    countryCode?: string
  }
  scheduledTime: string // ISO
  actualTime?: string // ISO
  status: FlightStatus
  terminal?: string
  gate?: string
  aircraftModel?: string
  aircraftReg?: string
}
