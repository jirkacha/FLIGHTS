import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../navigation"
import type { Flight, FlightDirection, FlightStatus } from "../types"
import { fetchFlights } from "../api"
import { useTheme, type Theme } from "../theme"
import { StatusBadge, TimeDisplay, AirlineLogo, DelayBadge, AircraftIcon } from "../components"
import {
  bearingDeg,
  delayMinutes,
  effectiveTime,
  estimateDurationMin,
  fmtDuration,
  haversineKm,
  isTerminalStatus,
  minutesUntil,
  PRG_COORDS,
} from "../utils"
import { getAirportCoords } from "../airports"

type Props = NativeStackScreenProps<RootStackParamList, "Flights">

// --- Filters ---------------------------------------------------------------

type EtaFilter = "all" | "30m" | "2h" | "active" | "delayed" | "cancelled" | "past"

const ETA_FILTERS: { id: EtaFilter; label: string }[] = [
  { id: "all", label: "Vše" },
  { id: "30m", label: "≤ 30 min" },
  { id: "2h", label: "≤ 2 h" },
  { id: "active", label: "Aktivní" },
  { id: "delayed", label: "Zpožděné" },
  { id: "cancelled", label: "Zrušené" },
  { id: "past", label: "Přistálé / odlétlé" },
]

const STATUS_FILTERS: ("All" | FlightStatus)[] = [
  "All",
  "Scheduled",
  "Boarding",
  "EnRoute",
  "Delayed",
  "Cancelled",
  "Arrived",
  "Departed",
]

const matchesEta = (f: Flight, filter: EtaFilter): boolean => {
  switch (filter) {
    case "all":
      return true
    case "30m": {
      if (isTerminalStatus(f)) return false
      const diff = Date.parse(effectiveTime(f)) - Date.now()
      return diff >= 0 && diff <= 30 * 60_000
    }
    case "2h": {
      if (isTerminalStatus(f)) return false
      const diff = Date.parse(effectiveTime(f)) - Date.now()
      return diff >= 0 && diff <= 2 * 60 * 60_000
    }
    case "active":
      return !isTerminalStatus(f)
    case "delayed":
      return !isTerminalStatus(f) && delayMinutes(f) >= 1
    case "cancelled":
      return f.status === "Cancelled"
    case "past":
      return f.status === "Arrived" || f.status === "Departed"
  }
}

const bearingForFlight = (f: Flight): number | null => {
  const c = getAirportCoords(f.counterpart.iata)
  if (!c) return null
  return f.direction === "arrival"
    ? bearingDeg(c[0], c[1], PRG_COORDS[0], PRG_COORDS[1])
    : bearingDeg(PRG_COORDS[0], PRG_COORDS[1], c[0], c[1])
}

const distanceForFlight = (f: Flight): number | null => {
  const c = getAirportCoords(f.counterpart.iata)
  if (!c) return null
  return haversineKm(c[0], c[1], PRG_COORDS[0], PRG_COORDS[1])
}

// --- Component -------------------------------------------------------------

export const FlightsScreen: React.FC<Props> = ({ navigation }) => {
  const t = useTheme()
  const [direction, setDirection] = useState<FlightDirection>("arrival")
  const [etaFilter, setEtaFilter] = useState<EtaFilter>("active")
  const [statusFilter, setStatusFilter] = useState<"All" | FlightStatus>("All")
  const [showStatusFilter, setShowStatusFilter] = useState(false)
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMock, setIsMock] = useState(false)

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const { flights, isMock } = await fetchFlights(direction)
        setFlights(flights)
        setIsMock(isMock)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [direction],
  )

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 60_000)
    return () => clearInterval(id)
  }, [load])

  const etaCounts = useMemo(() => {
    const counts: Record<EtaFilter, number> = {
      all: flights.length,
      "30m": 0,
      "2h": 0,
      active: 0,
      delayed: 0,
      cancelled: 0,
      past: 0,
    }
    for (const f of flights) {
      if (matchesEta(f, "30m")) counts["30m"]++
      if (matchesEta(f, "2h")) counts["2h"]++
      if (matchesEta(f, "active")) counts.active++
      if (matchesEta(f, "delayed")) counts.delayed++
      if (matchesEta(f, "cancelled")) counts.cancelled++
      if (matchesEta(f, "past")) counts.past++
    }
    return counts
  }, [flights])

  const filtered = useMemo(() => {
    let list = flights.filter((f) => matchesEta(f, etaFilter))
    if (statusFilter !== "All") list = list.filter((f) => f.status === statusFilter)
    return list
  }, [flights, etaFilter, statusFilter])

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      {/* Direction toggle */}
      <View style={[styles.toggle, { backgroundColor: t.card, borderColor: t.border }]}>
        {(["arrival", "departure"] as FlightDirection[]).map((d) => {
          const active = direction === d
          return (
            <Pressable
              key={d}
              onPress={() => setDirection(d)}
              style={[styles.toggleBtn, active && { backgroundColor: t.accent }]}
            >
              <Text style={[styles.toggleText, { color: active ? "#fff" : t.text }]}>
                {d === "departure" ? "✈ Odlety" : "🛬 Přílety"}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* ETA filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {ETA_FILTERS.map((f) => {
          const active = etaFilter === f.id
          const count = etaCounts[f.id]
          return (
            <Pressable
              key={f.id}
              onPress={() => setEtaFilter(f.id)}
              style={[
                styles.chip,
                { borderColor: t.border, backgroundColor: active ? t.accent : t.card },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : t.text }]}>
                {f.label}
                <Text style={{ color: active ? "#fff" : t.textMuted, fontWeight: "400" }}>
                  {"  "}
                  {count}
                </Text>
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Status filter (collapsible) */}
      <Pressable
        onPress={() => setShowStatusFilter((v) => !v)}
        style={styles.statusToggle}
      >
        <Text style={[styles.statusToggleText, { color: t.textMuted }]}>
          {showStatusFilter ? "▾" : "▸"} Filtr dle stavu
          {statusFilter !== "All" ? `: ${statusFilter}` : ""}
        </Text>
      </Pressable>
      {showStatusFilter && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s
            return (
              <Pressable
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[
                  styles.chip,
                  { borderColor: t.border, backgroundColor: active ? t.accent : t.card },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? "#fff" : t.text }]}>{s}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {isMock && (
        <View style={[styles.banner, { backgroundColor: t.warning }]}>
          <Text style={styles.bannerText}>
            ⚠️ Ukázková data — nastav EXPO_PUBLIC_RAPIDAPI_KEY v .env (viz README)
          </Text>
        </View>
      )}

      {error && (
        <View style={[styles.banner, { backgroundColor: t.danger }]}>
          <Text style={styles.bannerText}>Chyba: {error}</Text>
        </View>
      )}

      {loading && flights.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={t.accent}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.textMuted }]}>
              Žádné lety pro tento filtr.
            </Text>
          }
          renderItem={({ item }) => (
            <FlightRow
              flight={item}
              direction={direction}
              onPress={() => navigation.navigate("FlightDetail", { flight: item })}
              onMap={() => navigation.navigate("Map", { focusFlightId: item.id })}
              t={t}
            />
          )}
        />
      )}
    </View>
  )
}

// --- Row -------------------------------------------------------------------

const FlightRow: React.FC<{
  flight: Flight
  direction: FlightDirection
  onPress: () => void
  onMap: () => void
  t: Theme
}> = ({ flight, direction, onPress, onMap, t }) => {
  const eta = minutesUntil(effectiveTime(flight))
  const heading = bearingForFlight(flight)
  const distance = distanceForFlight(flight)
  const duration = distance ? estimateDurationMin(distance) : null
  const delay = delayMinutes(flight)
  const isEarly = delay < 0 && !isTerminalStatus(flight)
  const isImminent = !isTerminalStatus(flight) && eta >= 0 && eta <= 30
  const isDelayed = delay >= 15 && !isTerminalStatus(flight)
  const isCancelled = flight.status === "Cancelled"

  // Border color encodes "watchworthy" state.
  const borderColor = isCancelled
    ? t.danger
    : isImminent
      ? t.accent
      : isDelayed
        ? t.warning
        : isEarly
          ? t.success
          : t.border
  const borderWidth = isCancelled || isImminent || isDelayed || isEarly ? 2 : 1

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.card,
          borderColor,
          borderWidth,
          opacity: pressed ? 0.7 : isTerminalStatus(flight) && !isCancelled ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.cardLeft}>
        <TimeDisplay flight={flight} />
        <Text style={[styles.flightNumber, { color: t.textMuted }]}>{flight.number}</Text>
        {isImminent && eta >= 0 && (
          <View style={[styles.etaPill, { backgroundColor: t.accent }]}>
            <Text style={styles.etaPillText}>za {eta} min</Text>
          </View>
        )}
      </View>
      <View style={styles.cardMiddle}>
        <View style={styles.airlineRow}>
          <AirlineLogo iata={flight.airlineIata} size={22} />
          <Text style={[styles.airline, { color: t.textMuted }]} numberOfLines={1}>
            {flight.airlineName}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <AircraftIcon
            flight={flight}
            headingDeg={heading}
            color={isImminent ? t.accent : t.text}
          />
          <Text style={[styles.airport, { color: t.text }]} numberOfLines={1}>
            {"  "}
            {direction === "departure" ? "→ " : "← z "}
            {flight.counterpart.city ?? flight.counterpart.name}
            {flight.counterpart.iata ? ` (${flight.counterpart.iata})` : ""}
          </Text>
        </View>
        {(flight.aircraftModel || duration || distance) && (
          <Text style={[styles.aircraftLine, { color: t.textMuted }]} numberOfLines={1}>
            {flight.aircraftModel ? `🛩  ${flight.aircraftModel}` : "🛩  —"}
            {flight.aircraftReg ? ` · ${flight.aircraftReg}` : ""}
            {duration ? `  ·  ⏱ ${fmtDuration(duration)}` : ""}
            {distance ? `  ·  ${Math.round(distance)} km` : ""}
          </Text>
        )}
        <View style={styles.statusRow}>
          <StatusBadge flight={flight} />
          <DelayBadge flight={flight} threshold={1} />
        </View>
      </View>
      <View style={styles.cardRight}>
        {!!flight.terminal && (
          <Text style={[styles.gate, { color: t.text }]}>T{flight.terminal}</Text>
        )}
        {!!flight.gate && (
          <Text style={[styles.gateSub, { color: t.textMuted }]}>Gate {flight.gate}</Text>
        )}
        <Pressable
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation()
            onMap()
          }}
          style={({ pressed }) => [
            styles.mapBtn,
            { borderColor: t.border, opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Text style={{ fontSize: 14 }}>🗺️</Text>
        </Pressable>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggle: {
    flexDirection: "row",
    margin: 12,
    marginBottom: 6,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9 },
  toggleText: { fontSize: 15, fontWeight: "600" },
  filterRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 6, flexDirection: "row" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "500" },
  statusToggle: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 4 },
  statusToggleText: { fontSize: 12, fontWeight: "500" },
  banner: { padding: 8, marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  bannerText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", marginTop: 40 },
  card: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 12,
    gap: 12,
    alignItems: "center",
  },
  cardLeft: { minWidth: 78 },
  cardMiddle: { flex: 1 },
  cardRight: { alignItems: "flex-end", minWidth: 56, gap: 4 },
  flightNumber: { fontSize: 11, marginTop: 2 },
  etaPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  etaPillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  routeRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  airport: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  airlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  airline: { fontSize: 12, flex: 1 },
  aircraftLine: { fontSize: 11, marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  gate: { fontSize: 14, fontWeight: "600" },
  gateSub: { fontSize: 11, marginTop: 2 },
  mapBtn: {
    marginTop: 4,
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
})
