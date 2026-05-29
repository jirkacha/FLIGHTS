import type { Flight } from "./types"

export type RootStackParamList = {
  Flights: undefined
  FlightDetail: { flight: Flight }
  Map: undefined
}
