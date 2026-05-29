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
import type { Flight, FlightDirection } from "../types"
import { fetchFlights } from "../api"
import { fetchLiveAircraft, type LiveAircraft } from "../opensky"
import { buildMatchMap } from "../matchFlights"
import { useTheme, statusColor, type Theme } from "../theme"
import { AirlineLogo, Chip, Toggle } from "../components"
import {
  delayMinutes,
  effectiveTime,
  fmtDateRelative,
  fmtTime,
  flightProgress,
  haversineKm,
  isTerminalStatus,
  minutesUntil,
  PRG_COORDS,
} from "../utils"
import { getAirportCoords } from "../airports"

type Props = NativeStackScreenProps<RootStackParamList, "Flights">

// --- Filters ---------------------------------------------------------------

type EtaFilter = "active" | "30m" | "delayed" | "past" | "all"

const ETA_FILTERS: { id: EtaFilter; label: string }[] = [
  { id: "active", label: "Aktivní" },
  { id: "30m", label: "≤ 30 min" },
  { id: "delayed", label: "Zpožděné" },
  { id: "past", label: "Dokončené" },
  { id: "all", label: "Vše" },
]

/**
 * 'Active' means scheduled or in-flight AND its effective time hasn't slipped
 * more than 15 minutes into the past. Flights stuck on 'Delayed' without an
 * updated time would otherwise bubble to the top of arrivals — confusing
 * because the timetable should always look toward the future.
 */
const STALE_TOLERANCE_MS = 15 * 60_000

const isStale = (f: Flight): boolean =>
  Date.parse(effectiveTime(f)) < Date.now() - STALE_TOLERANCE_MS

const matchesEta = (f: Flight, filter: EtaFilter): boolean => {
  switch (filter) {
    case "all":
      return true
    case "30m": {
      if (isTerminalStatus(f) || isStale(f)) return false
      const diff = Date.parse(effectiveTime(f)) - Date.now()
      return diff >= 0 && diff <= 30 * 60_000
    }
    case "active":
      return !isTerminalStatus(f) && !isStale(f)
    case "delayed":
      // Stale flights belong here — they're effectively delayed without a new
      // ETA. The pile keeps them visible without polluting "Aktivní".
      return !isTerminalStatus(f) && (delayMinutes(f) >= 1 || isStale(f))
    case "past":
      return f.status === "Arrived" || f.status === "Departed" || f.status === "Cancelled"
  }
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
        const { flights, isMock } = await fetchFlights(direction)
        setFlights(flights)
        setIsMock(isMock)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
      fetchLiveAircraft()
        .then(setLive)
        .catch(() => {
          /* live data is optional */
        })
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
      active: 0,
      delayed: 0,
      past: 0,
    }
    for (const f of flights) {
      if (matchesEta(f, "30m")) counts["30m"]++
      if (matchesEta(f, "active")) counts.active++
      if (matchesEta(f, "delayed")) counts.delayed++
      if (matchesEta(f, "past")) counts.past++
    }
    return counts
  }, [flights])

  const filtered = useMemo(
    () => flights.filter((f) => matchesEta(f, etaFilter)),
    [flights, etaFilter],
  )

  return (
    <View style={[styles.outer, { backgroundColor: t.bg }]}>
      <View style={styles.constrained}>
        <View style={styles.controlsBar}>
          <Toggle
            value={direction}
            onChange={(v) => setDirection(v as FlightDirection)}
            options={[
              { id: "arrival", label: "🛬  Přílety" },
              { id: "departure", label: "✈  Odlety" },
            ]}
          />
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
        </View>

        {isMock && (
          <View style={[styles.banner, { backgroundColor: t.warning }]}>
            <Text style={styles.bannerText}>
              ⚠️ Ukázková data — nastav EXPO_PUBLIC_RAPIDAPI_KEY v .env
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
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: t.textMuted }]}>
                Žádné lety pro tento filtr.
              </Text>
            }
            renderItem={({ item }) => (
              <FlightRow
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

// --- Row -------------------------------------------------------------------

/**
 * Airport-board style row: time + status on the left, prominent counterpart
 * city in the middle, airline & flight number, terminal, and grouped actions
 * on the right. Active flights get a thin progress fill at the bottom.
 *
 * Time block convention: BIG = best-known (actual or scheduled); when actual
 * exists and differs, the original scheduled time is shown small + struck
 * through directly below.
 */
const FlightRow: React.FC<{
  flight: Flight
  direction: FlightDirection
  live?: LiveAircraft
  onPress: () => void
  onMap: () => void
  t: Theme
}> = ({ flight, direction, live, onPress, onMap, t }) => {
  const eta = minutesUntil(effectiveTime(flight))
  const delay = delayMinutes(flight)
  const isCancelled = flight.status === "Cancelled"
  const isDelayed = !isTerminalStatus(flight) && delay >= 15
  const isImminent = !isTerminalStatus(flight) && eta >= 0 && eta <= 30
  const isEarly = delay < 0 && !isTerminalStatus(flight)
  const arrived = flight.status === "Arrived" || flight.status === "Departed"
  const progress = flightProgress(flight, live)
  const showProgress = !isTerminalStatus(flight) && progress != null && progress > 0 && progress < 1

  const stripeColor = isCancelled
    ? t.danger
    : isImminent
      ? t.accent
      : isDelayed
        ? t.warning
        : isEarly
          ? t.success
          : arrived
            ? t.success
            : t.border

  const timeColor = isCancelled
    ? t.danger
    : isEarly
      ? t.success
      : isDelayed
        ? t.warning
        : t.text

  const statusBadgeColor = statusColor(flight.status, t)

  const counter = flight.counterpart
  const counterCity = counter.city ?? counter.name
  const distance = distanceForFlight(flight)
  const showSchedDate = fmtDateRelative(flight.scheduledTime)
  const schedTime = fmtTime(flight.scheduledTime)
  const actualTime = flight.actualTime ? fmtTime(flight.actualTime) : null
  const hasActualDiff = !!actualTime && actualTime !== schedTime

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        {
          backgroundColor: t.card,
          borderColor: hovered ? t.accent : t.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />

      <View style={styles.rowBody}>
        {/* Time column */}
        <View style={styles.timeCol}>
          <View style={styles.timeMainRow}>
            <Text style={[styles.timeMain, { color: timeColor, fontFamily: t.mono }]}>
              {actualTime ?? schedTime}
            </Text>
            {showSchedDate && (
              <Text style={[styles.timeDate, { color: t.textMuted, fontFamily: t.mono }]}>
                {showSchedDate}
              </Text>
            )}
          </View>
          {hasActualDiff && (
            <Text style={[styles.timeSched, { color: t.textMuted, fontFamily: t.mono }]}>
              {schedTime}
            </Text>
          )}
          <View style={styles.pillsRow}>
            <View style={[styles.statusPill, { borderColor: statusBadgeColor }]}>
              <Text style={[styles.statusPillText, { color: statusBadgeColor }]}>
                {flight.status}
              </Text>
            </View>
            {isImminent && eta >= 0 && (
              <View style={[styles.etaPill, { backgroundColor: t.accent }]}>
                <Text style={styles.etaPillText}>za {eta} min</Text>
              </View>
            )}
          </View>
        </View>

        {/* Counterpart column — what the user actually wants to see */}
        <View style={styles.destCol}>
          <Text style={[styles.destText, { color: t.text }]} numberOfLines={1}>
            {counterCity}
          </Text>
          <View style={styles.destSubRow}>
            {counter.iata && (
              <Text style={[styles.iataText, { color: t.accent, fontFamily: t.mono }]}>
                {counter.iata}
              </Text>
            )}
            {counter.countryCode && (
              <Text style={[styles.countryText, { color: t.textMuted }]}>
                · {counter.countryCode}
              </Text>
            )}
            {distance != null && (
              <Text style={[styles.distText, { color: t.textMuted, fontFamily: t.mono }]}>
                · {Math.round(distance).toLocaleString()} km
              </Text>
            )}
          </View>
        </View>

        {/* Airline column */}
        <View style={styles.airlineCol}>
          <AirlineLogo iata={flight.airlineIata} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[styles.flightNo, { color: t.accent, fontFamily: t.mono }]}
              numberOfLines={1}
            >
              {flight.number}
            </Text>
            <Text style={[styles.airlineName, { color: t.textMuted }]} numberOfLines={1}>
              {flight.airlineName}
            </Text>
          </View>
        </View>

        {/* Terminal column */}
        <View style={styles.terminalCol}>
          {flight.terminal ? (
            <Text style={[styles.terminalText, { color: t.text }]}>T{flight.terminal}</Text>
          ) : (
            <Text style={[styles.terminalText, { color: t.textMuted }]}>—</Text>
          )}
          {flight.gate && (
            <Text style={[styles.gateText, { color: t.textMuted }]}>Gate {flight.gate}</Text>
          )}
        </View>

        {/* Actions column — primary detail pill + secondary map link */}
        <View style={styles.actionsCol}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.detailBtn,
              { borderColor: t.accent, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.detailBtnText, { color: t.accent }]}>Detail letu</Text>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation()
              onMap()
            }}
            hitSlop={8}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.mapBtn,
              {
                borderColor: hovered ? t.accent : t.border,
                backgroundColor: hovered ? t.cardTint : "transparent",
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[styles.mapBtnText, { color: t.accent }]}>🗺</Text>
          </Pressable>
        </View>
      </View>

      {showProgress && (
        <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${(progress as number) * 100}%`, backgroundColor: stripeColor },
            ]}
          />
        </View>
      )}
    </Pressable>
  )
}

// --- Styles ----------------------------------------------------------------

const MAX_WIDTH = 1280

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: Platform.OS === "web" ? "center" : "stretch" },
  constrained: { flex: 1, width: "100%", maxWidth: MAX_WIDTH },
  controlsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  banner: { padding: 8, marginHorizontal: 16, borderRadius: 8, marginBottom: 4 },
  bannerText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", marginTop: 40 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  row: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  stripe: { width: 4, alignSelf: "stretch" },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },

  timeCol: { minWidth: 130, gap: 2 },
  timeMainRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  timeMain: { fontSize: 24, fontWeight: "800", lineHeight: 28, letterSpacing: 0.5 },
  timeDate: { fontSize: 12, fontWeight: "600" },
  timeSched: {
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "line-through",
    lineHeight: 14,
    marginTop: 2,
  },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  statusPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  statusPillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  etaPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  etaPillText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  destCol: { flex: 1.6, minWidth: 170, gap: 4 },
  destText: { fontSize: 18, fontWeight: "800", letterSpacing: 0.2 },
  destSubRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 4 },
  iataText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  countryText: { fontSize: 12, fontWeight: "600" },
  distText: { fontSize: 11, fontWeight: "600" },

  airlineCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 180,
    flex: 1,
  },
  flightNo: { fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  airlineName: { fontSize: 12, fontWeight: "500" },

  terminalCol: { minWidth: 56, alignItems: "center", gap: 2 },
  terminalText: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  gateText: { fontSize: 10, fontWeight: "500" },

  actionsCol: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailBtn: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  detailBtnText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  mapBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mapBtnText: { fontSize: 14 },

  progressTrack: { height: 3, width: "100%" },
  progressFill: { height: 3 },
})
