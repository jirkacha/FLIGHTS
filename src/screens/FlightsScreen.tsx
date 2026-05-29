import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../navigation"
import type { Flight, FlightDirection, FlightStatus } from "../types"
import { fetchFlights } from "../api"
import { fetchLiveAircraft, type LiveAircraft } from "../opensky"
import { buildMatchMap } from "../matchFlights"
import { useTheme, statusColor, type Theme } from "../theme"
import {
  StatusBadge,
  AirlineLogo,
  DelayBadge,
  AircraftIcon,
  Chip,
  Toggle,
  RouteProgress,
} from "../components"
import {
  bearingDeg,
  delayMinutes,
  effectiveTime,
  estimateDurationMin,
  flightProgress,
  fmtDuration,
  fmtTime,
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
  { id: "active", label: "Aktivní" },
  { id: "30m", label: "≤ 30 m" },
  { id: "2h", label: "≤ 2 h" },
  { id: "delayed", label: "Zpožděné" },
  { id: "cancelled", label: "Zrušené" },
  { id: "past", label: "Dokončené" },
  { id: "all", label: "Vše" },
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
  const [live, setLive] = useState<LiveAircraft[]>([])
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
        const [{ flights, isMock }, liveRes] = await Promise.all([
          fetchFlights(direction),
          fetchLiveAircraft().catch(() => [] as LiveAircraft[]),
        ])
        setFlights(flights)
        setIsMock(isMock)
        setLive(liveRes)
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

  const liveMatch = useMemo(() => buildMatchMap(live, flights), [live, flights])
  const liveByFlightId = useMemo(() => {
    const m = new Map<string, LiveAircraft>()
    for (const a of live) {
      const f = liveMatch.get(a.icao24)
      if (f) m.set(f.id, a)
    }
    return m
  }, [live, liveMatch])

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
    <View style={[styles.outer, { backgroundColor: t.bg }]}>
      <View style={styles.constrained}>
        <View style={styles.topRow}>
          <Toggle
            value={direction}
            onChange={(v) => setDirection(v as FlightDirection)}
            options={[
              { id: "arrival", label: "🛬  Přílety" },
              { id: "departure", label: "✈  Odlety" },
            ]}
          />
        </View>

        <View style={styles.chipsRow}>
          {ETA_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              active={etaFilter === f.id}
              count={etaCounts[f.id]}
              onPress={() => setEtaFilter(f.id)}
            />
          ))}
        </View>

        <Pressable onPress={() => setShowStatusFilter((v) => !v)} style={styles.statusToggle}>
          <Text style={[styles.statusToggleText, { color: t.textMuted }]}>
            {showStatusFilter ? "▾" : "▸"} Filtr dle stavu
            {statusFilter !== "All" ? `: ${statusFilter}` : ""}
          </Text>
        </Pressable>
        {showStatusFilter && (
          <View style={styles.chipsRow}>
            {STATUS_FILTERS.map((s) => (
              <Chip
                key={s}
                label={s}
                active={statusFilter === s}
                onPress={() => setStatusFilter(s)}
              />
            ))}
          </View>
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
            contentContainerStyle={styles.listContent}
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
              <FlightCard
                flight={item}
                direction={direction}
                live={liveByFlightId.get(item.id)}
                onPress={() => navigation.navigate("FlightDetail", { flight: item })}
                onMap={() => navigation.navigate("Map", { focusFlightId: item.id })}
                t={t}
              />
            )}
          />
        )}
      </View>
    </View>
  )
}

// --- Card ------------------------------------------------------------------

const FlightCard: React.FC<{
  flight: Flight
  direction: FlightDirection
  live?: LiveAircraft
  onPress: () => void
  onMap: () => void
  t: Theme
}> = ({ flight, direction, live, onPress, onMap, t }) => {
  const eta = minutesUntil(effectiveTime(flight))
  const heading = bearingForFlight(flight)
  const distance = distanceForFlight(flight)
  const duration = distance ? estimateDurationMin(distance) : null
  const delay = delayMinutes(flight)
  const progress = flightProgress(flight, live)
  const isEarly = delay < 0 && !isTerminalStatus(flight)
  const isImminent = !isTerminalStatus(flight) && eta >= 0 && eta <= 30
  const isDelayed = delay >= 15 && !isTerminalStatus(flight)
  const isCancelled = flight.status === "Cancelled"
  const arrived = flight.status === "Arrived" || flight.status === "Departed"

  // Left stripe color: priority cancelled > delayed > imminent > early > arrived > none
  const stripeColor = isCancelled
    ? t.danger
    : isImminent
      ? t.accent
      : isDelayed
        ? t.warning
        : isEarly
          ? t.success
          : arrived
            ? t.textMuted
            : t.border

  const trackColor = isCancelled ? t.danger : statusColor(flight.status, t)
  const origin = direction === "arrival" ? flight.counterpart : { iata: "PRG", city: "Praha", name: "Praha" }
  const dest = direction === "arrival" ? { iata: "PRG", city: "Praha", name: "Praha" } : flight.counterpart
  const schedTime = fmtTime(flight.scheduledTime)
  const actualTime = flight.actualTime ? fmtTime(flight.actualTime) : null

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.card,
          borderColor: t.border,
          opacity: pressed ? 0.78 : arrived && !isCancelled ? 0.82 : 1,
        },
      ]}
    >
      {/* Left status stripe */}
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />

      <View style={styles.cardBody}>
        {/* Header row: time, airline+number, terminal */}
        <View style={styles.headerRow}>
          <View style={styles.timeCol}>
            <Text style={[styles.timeMain, { color: actualTime ? t.textMuted : t.text, fontFamily: t.mono, textDecorationLine: actualTime ? "line-through" : "none" }]}>
              {schedTime}
            </Text>
            {actualTime && (
              <Text style={[styles.timeActual, { color: isEarly ? t.success : isDelayed ? t.warning : t.text, fontFamily: t.mono }]}>
                {actualTime}
              </Text>
            )}
          </View>

          <View style={styles.airlineCol}>
            <View style={styles.airlineRow}>
              <AirlineLogo iata={flight.airlineIata} size={20} />
              <Text style={[styles.flightNo, { color: t.text, fontFamily: t.mono }]}>{flight.number}</Text>
              <Text style={[styles.airlineName, { color: t.textMuted }]} numberOfLines={1}>
                {flight.airlineName}
              </Text>
            </View>
            {(flight.aircraftModel || flight.aircraftReg) && (
              <View style={styles.aircraftRow}>
                <AircraftIcon flight={flight} headingDeg={null} color={t.textMuted} />
                <Text style={[styles.aircraftText, { color: t.textMuted }]} numberOfLines={1}>
                  {[flight.aircraftModel, flight.aircraftReg].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.terminalCol}>
            {flight.terminal && (
              <Text style={[styles.terminalText, { color: t.text }]}>T{flight.terminal}</Text>
            )}
            {flight.gate && (
              <Text style={[styles.gateText, { color: t.textMuted }]}>{flight.gate}</Text>
            )}
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation()
                onMap()
              }}
              style={({ pressed }) => [
                styles.mapBtn,
                { borderColor: t.border, backgroundColor: t.cardTint, opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Text style={{ fontSize: 13 }}>🗺️</Text>
            </Pressable>
          </View>
        </View>

        {/* Route row: origin code — progress — dest code */}
        <View style={styles.routeRow}>
          <View style={styles.iataCol}>
            <Text style={[styles.iataText, { color: t.text, fontFamily: t.mono }]}>
              {origin.iata ?? "—"}
            </Text>
            <Text style={[styles.cityText, { color: t.textMuted }]} numberOfLines={1}>
              {origin.city ?? origin.name}
            </Text>
          </View>
          <View style={styles.progressCol}>
            {progress != null ? (
              <RouteProgress progress={progress} color={trackColor} heading={heading} />
            ) : (
              <View style={[styles.progressFallback, { backgroundColor: t.border }]} />
            )}
            {progress != null && progress < 1 && !isCancelled && (
              <Text style={[styles.progressLabel, { color: t.textMuted, fontFamily: t.mono }]}>
                {Math.round(progress * 100)}%
                {duration ? `  ·  ~${fmtDuration(duration)}` : ""}
                {distance ? `  ·  ${Math.round(distance).toLocaleString()} km` : ""}
              </Text>
            )}
            {progress == null && (
              <Text style={[styles.progressLabel, { color: t.textMuted, fontFamily: t.mono }]}>
                {duration ? `~${fmtDuration(duration)}` : ""}
                {distance ? `  ·  ${Math.round(distance).toLocaleString()} km` : ""}
              </Text>
            )}
          </View>
          <View style={[styles.iataCol, { alignItems: "flex-end" }]}>
            <Text style={[styles.iataText, { color: t.text, fontFamily: t.mono }]}>
              {dest.iata ?? "—"}
            </Text>
            <Text style={[styles.cityText, { color: t.textMuted }]} numberOfLines={1}>
              {dest.city ?? dest.name}
            </Text>
          </View>
        </View>

        {/* Footer: status + delay + ETA */}
        <View style={styles.footerRow}>
          <StatusBadge flight={flight} />
          <DelayBadge flight={flight} threshold={1} />
          {isImminent && eta >= 0 && (
            <View style={[styles.etaPill, { backgroundColor: t.accent }]}>
              <Text style={styles.etaPillText}>za {eta} min</Text>
            </View>
          )}
          {live && !live.onGround && live.altitudeFt != null && (
            <Text style={[styles.liveMeta, { color: t.success, fontFamily: t.mono }]}>
              ▲ {Math.round(live.altitudeFt).toLocaleString()} ft
              {live.groundSpeedKt != null ? ` · ${Math.round(live.groundSpeedKt)} kt` : ""}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

// --- Styles ----------------------------------------------------------------

const MAX_WIDTH = 760

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: Platform.OS === "web" ? "center" : "stretch" },
  constrained: { flex: 1, width: "100%", maxWidth: MAX_WIDTH },
  topRow: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  statusToggle: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4 },
  statusToggleText: { fontSize: 12, fontWeight: "500" },
  banner: { padding: 8, marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  bannerText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", marginTop: 40 },
  listContent: { padding: 12, paddingBottom: 24 },

  card: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  stripe: { width: 4, alignSelf: "stretch" },
  cardBody: { flex: 1, padding: 12, gap: 10 },

  headerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  timeCol: { minWidth: 60 },
  timeMain: { fontSize: 18, fontWeight: "700", lineHeight: 22 },
  timeActual: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  airlineCol: { flex: 1, gap: 4 },
  airlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  flightNo: { fontSize: 14, fontWeight: "700" },
  airlineName: { fontSize: 12, flex: 1 },
  aircraftRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aircraftText: { fontSize: 11 },
  terminalCol: { alignItems: "flex-end", gap: 3, minWidth: 50 },
  terminalText: { fontSize: 14, fontWeight: "700" },
  gateText: { fontSize: 11 },
  mapBtn: {
    marginTop: 2,
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  routeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iataCol: { minWidth: 56, gap: 2 },
  iataText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  cityText: { fontSize: 11 },
  progressCol: { flex: 1, gap: 4 },
  progressFallback: { height: 2, borderRadius: 1 },
  progressLabel: { fontSize: 10, textAlign: "center" },

  footerRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  etaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  etaPillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  liveMeta: { fontSize: 11, fontWeight: "600", marginLeft: "auto" },
})
