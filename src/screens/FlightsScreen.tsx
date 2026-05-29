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
  fmtDateShort,
  fmtTime,
  flightProgress,
  isTerminalStatus,
  minutesUntil,
} from "../utils"

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

const matchesEta = (f: Flight, filter: EtaFilter): boolean => {
  switch (filter) {
    case "all":
      return true
    case "30m": {
      if (isTerminalStatus(f)) return false
      const diff = Date.parse(effectiveTime(f)) - Date.now()
      return diff >= 0 && diff <= 30 * 60_000
    }
    case "active":
      return !isTerminalStatus(f)
    case "delayed":
      return !isTerminalStatus(f) && delayMinutes(f) >= 1
    case "past":
      return f.status === "Arrived" || f.status === "Departed" || f.status === "Cancelled"
  }
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
 * Horizontal flight row inspired by airport board displays: one line per
 * flight with scheduled vs actual time, airline + number, route, terminal,
 * and a detail action. Active flights get a thin progress bar at the bottom.
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

  const statusBadgeColor = statusColor(flight.status, t)

  const counter = flight.counterpart
  const counterLabel = counter.iata
    ? `${counter.city ?? counter.name} (${counter.iata})`
    : (counter.city ?? counter.name)

  const schedTime = fmtTime(flight.scheduledTime)
  const actualTime = flight.actualTime ? fmtTime(flight.actualTime) : null
  const dateLabel = fmtDateShort(flight.actualTime ?? flight.scheduledTime)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.card,
          borderColor: t.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />

      <View style={styles.rowBody}>
        {/* Time column */}
        <View style={styles.timeCol}>
          {actualTime ? (
            <>
              <Text
                style={[
                  styles.timeSched,
                  { color: t.textMuted, fontFamily: t.mono },
                ]}
              >
                {schedTime}
              </Text>
              <View style={styles.timeMainRow}>
                <Text
                  style={[
                    styles.timeMain,
                    {
                      color: isCancelled
                        ? t.danger
                        : isEarly
                          ? t.success
                          : isDelayed
                            ? t.warning
                            : t.text,
                      fontFamily: t.mono,
                    },
                  ]}
                >
                  {actualTime}
                </Text>
                <Text style={[styles.timeDate, { color: t.textMuted, fontFamily: t.mono }]}>
                  {dateLabel}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.timeMainRow}>
              <Text style={[styles.timeMain, { color: t.text, fontFamily: t.mono }]}>
                {schedTime}
              </Text>
              <Text style={[styles.timeDate, { color: t.textMuted, fontFamily: t.mono }]}>
                {dateLabel}
              </Text>
            </View>
          )}
          <View style={[styles.statusPill, { borderColor: statusBadgeColor }]}>
            <Text style={[styles.statusPillText, { color: statusBadgeColor }]}>
              {flight.status}
            </Text>
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

        {/* Destination column */}
        <View style={styles.destCol}>
          <Text style={[styles.destText, { color: t.accent }]} numberOfLines={1}>
            {direction === "arrival" ? counterLabel : counterLabel}
          </Text>
          <Text style={[styles.destSub, { color: t.textMuted }]} numberOfLines={1}>
            {direction === "arrival" ? "→ Praha (PRG)" : "Praha (PRG) →"}
          </Text>
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

        {/* Actions column */}
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
            style={({ pressed }) => [
              styles.mapBtn,
              { borderColor: t.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.mapBtnText}>🗺️</Text>
          </Pressable>
        </View>
      </View>

      {/* Thin progress bar at the bottom for active flights */}
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
    gap: 10,
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

  timeCol: { minWidth: 110, gap: 4 },
  timeMainRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  timeSched: {
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "line-through",
    lineHeight: 14,
  },
  timeMain: { fontSize: 22, fontWeight: "800", lineHeight: 26, letterSpacing: 0.5 },
  timeDate: { fontSize: 12, fontWeight: "600" },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 2,
  },
  statusPillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },

  airlineCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 180,
    flex: 1.1,
  },
  flightNo: { fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  airlineName: { fontSize: 12, fontWeight: "500" },

  destCol: { flex: 1.4, minWidth: 160, gap: 2 },
  destText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  destSub: { fontSize: 11, fontWeight: "500" },

  terminalCol: { minWidth: 56, alignItems: "center", gap: 2 },
  terminalText: { fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
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
