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
import { StatusBadge, TimeDisplay, AirlineLogo, DelayBadge, DirectionalPlane } from "../components"
import {
  bearingDeg,
  delayMinutes,
  effectiveTime,
  isTerminalStatus,
  minutesUntil,
  PRG_COORDS,
} from "../utils"
import { getAirportCoords } from "../airports"

type Props = NativeStackScreenProps<RootStackParamList, "Flights">

const STATUSES: ("All" | FlightStatus)[] = [
  "All",
  "Scheduled",
  "Boarding",
  "EnRoute",
  "Delayed",
  "Cancelled",
  "Arrived",
  "Departed",
]

const IMMINENT_WINDOW_MS = 30 * 60 * 1000

const isImminent = (f: Flight): boolean => {
  if (isTerminalStatus(f)) return false
  const diff = Date.parse(effectiveTime(f)) - Date.now()
  return diff >= 0 && diff <= IMMINENT_WINDOW_MS
}

const bearingForFlight = (f: Flight): number | null => {
  const c = getAirportCoords(f.counterpart.iata)
  if (!c) return null
  return f.direction === "arrival"
    ? bearingDeg(c[0], c[1], PRG_COORDS[0], PRG_COORDS[1])
    : bearingDeg(PRG_COORDS[0], PRG_COORDS[1], c[0], c[1])
}

type ListItem =
  | { kind: "imminent-header"; direction: FlightDirection }
  | { kind: "active-header"; count: number }
  | { kind: "past-header"; count: number; expanded: boolean }
  | { kind: "flight"; flight: Flight; imminent: boolean; muted?: boolean }

export const FlightsScreen: React.FC<Props> = ({ navigation }) => {
  const t = useTheme()
  const [direction, setDirection] = useState<FlightDirection>("arrival")
  const [statusFilter, setStatusFilter] = useState<"All" | FlightStatus>("All")
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [pastExpanded, setPastExpanded] = useState(false)

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

  // Reset "expanded past" whenever the user switches direction or filter.
  useEffect(() => setPastExpanded(false), [direction, statusFilter])

  const filtered = useMemo(
    () => (statusFilter === "All" ? flights : flights.filter((f) => f.status === statusFilter)),
    [flights, statusFilter],
  )

  const { imminent, active, past, delayedCount } = useMemo(() => {
    const imminent = filtered.filter(isImminent)
    const imminentIds = new Set(imminent.map((f) => f.id))
    const active: Flight[] = []
    const past: Flight[] = []
    let delayedCount = 0
    for (const f of filtered) {
      if (delayMinutes(f) > 0 && !isTerminalStatus(f)) delayedCount++
      if (imminentIds.has(f.id)) continue
      if (isTerminalStatus(f)) past.push(f)
      else active.push(f)
    }
    // Past list: most-recently-completed first.
    past.sort((a, b) => effectiveTime(b).localeCompare(effectiveTime(a)))
    return { imminent: imminent.slice(0, 5), active, past, delayedCount }
  }, [filtered])

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = []
    if (imminent.length > 0) {
      items.push({ kind: "imminent-header", direction })
      for (const f of imminent) items.push({ kind: "flight", flight: f, imminent: true })
    }
    if (active.length > 0) {
      items.push({ kind: "active-header", count: active.length })
      for (const f of active) items.push({ kind: "flight", flight: f, imminent: false })
    }
    if (past.length > 0) {
      items.push({ kind: "past-header", count: past.length, expanded: pastExpanded })
      if (pastExpanded) {
        for (const f of past) items.push({ kind: "flight", flight: f, imminent: false, muted: true })
      }
    }
    return items
  }, [imminent, active, past, direction, pastExpanded])

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

      {/* Stats line */}
      {flights.length > 0 && (
        <View style={styles.statsRow}>
          <Text style={[styles.statsText, { color: t.textMuted }]}>
            <Text style={{ color: t.text, fontWeight: "600" }}>{active.length + imminent.length}</Text>{" "}
            aktivních
            {delayedCount > 0 && (
              <>
                {" · "}
                <Text style={{ color: t.warning, fontWeight: "600" }}>{delayedCount}</Text> zpožděných
              </>
            )}
            {past.length > 0 && (
              <>
                {" · "}
                {past.length} dokončených
              </>
            )}
          </Text>
        </View>
      )}

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {STATUSES.map((s) => {
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
          data={listData}
          keyExtractor={(item, idx) =>
            item.kind === "flight" ? `f-${item.flight.id}-${item.muted ? "p" : "a"}` : `h-${item.kind}-${idx}`
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={t.accent}
            />
          }
          ItemSeparatorComponent={({ leadingItem }: { leadingItem?: ListItem }) =>
            leadingItem && leadingItem.kind === "flight" ? <View style={{ height: 8 }} /> : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.textMuted }]}>Žádné lety k zobrazení.</Text>
          }
          renderItem={({ item }) => {
            if (item.kind === "imminent-header") {
              return (
                <SectionHeader
                  t={t}
                  title={`⏰ ${item.direction === "arrival" ? "Brzy přilétají" : "Brzy odlétají"}`}
                  subtitle="do 30 minut"
                />
              )
            }
            if (item.kind === "active-header") {
              return <SectionHeader t={t} title="Aktivní" subtitle={`${item.count}`} compact />
            }
            if (item.kind === "past-header") {
              return (
                <Pressable
                  onPress={() => setPastExpanded((v) => !v)}
                  style={[styles.pastToggle, { borderColor: t.border, backgroundColor: t.card }]}
                >
                  <Text style={[styles.pastToggleText, { color: t.textMuted }]}>
                    {item.expanded ? "▾" : "▸"} Přistálé / odlétlé / zrušené ({item.count})
                  </Text>
                </Pressable>
              )
            }
            return (
              <FlightRow
                flight={item.flight}
                direction={direction}
                imminent={item.imminent}
                muted={item.muted}
                onPress={() => navigation.navigate("FlightDetail", { flight: item.flight })}
                onMap={() => navigation.navigate("Map", { focusFlightId: item.flight.id })}
                t={t}
              />
            )
          }}
        />
      )}
    </View>
  )
}

const SectionHeader: React.FC<{
  t: Theme
  title: string
  subtitle?: string
  compact?: boolean
}> = ({ t, title, subtitle, compact }) => (
  <View style={[styles.sectionHeader, compact && { marginTop: 4 }]}>
    <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
    {subtitle && <Text style={[styles.sectionSub, { color: t.textMuted }]}>{subtitle}</Text>}
  </View>
)

const FlightRow: React.FC<{
  flight: Flight
  direction: FlightDirection
  imminent: boolean
  muted?: boolean
  onPress: () => void
  onMap: () => void
  t: Theme
}> = ({ flight, direction, imminent, muted, onPress, onMap, t }) => {
  const eta = minutesUntil(effectiveTime(flight))
  const heading = bearingForFlight(flight)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.card,
          borderColor: imminent ? t.accent : t.border,
          borderWidth: imminent ? 2 : 1,
          opacity: pressed ? 0.7 : muted ? 0.65 : 1,
        },
      ]}
    >
      <View style={styles.cardLeft}>
        <TimeDisplay flight={flight} />
        <Text style={[styles.flightNumber, { color: t.textMuted }]}>{flight.number}</Text>
        {imminent && eta >= 0 && (
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
          <DirectionalPlane headingDeg={heading} size={16} color={imminent ? t.accent : t.text} />
          <Text style={[styles.airport, { color: t.text }]} numberOfLines={1}>
            {direction === "departure" ? " " : " z "}
            {flight.counterpart.city ?? flight.counterpart.name}
            {flight.counterpart.iata ? ` (${flight.counterpart.iata})` : ""}
          </Text>
        </View>
        {!!flight.aircraftModel && (
          <Text style={[styles.aircraftLine, { color: t.textMuted }]} numberOfLines={1}>
            🛩  {flight.aircraftModel}
            {flight.aircraftReg ? ` · ${flight.aircraftReg}` : ""}
          </Text>
        )}
        <View style={styles.statusRow}>
          <StatusBadge flight={flight} />
          <DelayBadge flight={flight} threshold={15} />
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
  statsRow: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 6 },
  statsText: { fontSize: 12 },
  filterRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 6, flexDirection: "row" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "500" },
  banner: { padding: 8, marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  bannerText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", marginTop: 40 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionSub: { fontSize: 12 },
  pastToggle: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  pastToggleText: { fontSize: 13, fontWeight: "600" },
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
