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
import { StatusBadge, TimeDisplay, AirlineLogo } from "../components"

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

const minutesUntil = (iso: string): number => {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.round((t - Date.now()) / 60_000)
}

const isImminent = (f: Flight): boolean => {
  if (f.status === "Arrived" || f.status === "Departed" || f.status === "Cancelled") return false
  const eta = f.actualTime ?? f.scheduledTime
  const diff = new Date(eta).getTime() - Date.now()
  return diff >= 0 && diff <= IMMINENT_WINDOW_MS
}

export const FlightsScreen: React.FC<Props> = ({ navigation }) => {
  const t = useTheme()
  const [direction, setDirection] = useState<FlightDirection>("arrival")
  const [statusFilter, setStatusFilter] = useState<"All" | FlightStatus>("All")
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

  const imminent = useMemo(() => flights.filter(isImminent).slice(0, 5), [flights])

  const filtered = useMemo(
    () => (statusFilter === "All" ? flights : flights.filter((f) => f.status === statusFilter)),
    [flights, statusFilter],
  )

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
            <Text style={[styles.empty, { color: t.textMuted }]}>Žádné lety k zobrazení.</Text>
          }
          ListHeaderComponent={
            imminent.length > 0 ? (
              <ImminentSection
                flights={imminent}
                direction={direction}
                onPress={(f) => navigation.navigate("FlightDetail", { flight: f })}
                t={t}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <FlightRow
              flight={item}
              direction={direction}
              imminent={isImminent(item)}
              onPress={() => navigation.navigate("FlightDetail", { flight: item })}
              t={t}
            />
          )}
        />
      )}
    </View>
  )
}

const ImminentSection: React.FC<{
  flights: Flight[]
  direction: FlightDirection
  onPress: (f: Flight) => void
  t: Theme
}> = ({ flights, direction, onPress, t }) => (
  <View style={{ marginBottom: 14 }}>
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>
        ⏰ {direction === "arrival" ? "Brzy přilétají" : "Brzy odlétají"}
      </Text>
      <Text style={[styles.sectionSub, { color: t.textMuted }]}>do 30 minut</Text>
    </View>
    <View style={{ gap: 8 }}>
      {flights.map((f) => (
        <FlightRow
          key={`imm-${f.id}`}
          flight={f}
          direction={direction}
          imminent
          onPress={() => onPress(f)}
          t={t}
        />
      ))}
    </View>
    <View style={[styles.divider, { backgroundColor: t.border }]} />
  </View>
)

const FlightRow: React.FC<{
  flight: Flight
  direction: FlightDirection
  imminent: boolean
  onPress: () => void
  t: Theme
}> = ({ flight, direction, imminent, onPress, t }) => {
  const eta = minutesUntil(flight.actualTime ?? flight.scheduledTime)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.card,
          borderColor: imminent ? t.accent : t.border,
          borderWidth: imminent ? 2 : 1,
          opacity: pressed ? 0.7 : 1,
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
        <Text style={[styles.airport, { color: t.text }]} numberOfLines={1}>
          {direction === "departure" ? "→ " : "← "}
          {flight.counterpart.city ?? flight.counterpart.name}
          {flight.counterpart.iata ? ` (${flight.counterpart.iata})` : ""}
        </Text>
        {!!flight.aircraftModel && (
          <Text style={[styles.aircraftLine, { color: t.textMuted }]} numberOfLines={1}>
            🛩  {flight.aircraftModel}
            {flight.aircraftReg ? ` · ${flight.aircraftReg}` : ""}
          </Text>
        )}
        <View style={{ marginTop: 4 }}>
          <StatusBadge flight={flight} />
        </View>
      </View>
      <View style={styles.cardRight}>
        {!!flight.terminal && (
          <Text style={[styles.gate, { color: t.text }]}>T{flight.terminal}</Text>
        )}
        {!!flight.gate && (
          <Text style={[styles.gateSub, { color: t.textMuted }]}>Gate {flight.gate}</Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggle: {
    flexDirection: "row",
    margin: 12,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9 },
  toggleText: { fontSize: 15, fontWeight: "600" },
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
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionSub: { fontSize: 12 },
  divider: { height: 1, marginTop: 14 },
  card: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 12,
    gap: 12,
    alignItems: "center",
  },
  cardLeft: { minWidth: 78 },
  cardMiddle: { flex: 1 },
  cardRight: { alignItems: "flex-end", minWidth: 56 },
  flightNumber: { fontSize: 11, marginTop: 2 },
  etaPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  etaPillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  airport: { fontSize: 15, fontWeight: "600", marginTop: 4 },
  airlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  airline: { fontSize: 12, flex: 1 },
  aircraftLine: { fontSize: 11, marginTop: 4 },
  gate: { fontSize: 14, fontWeight: "600" },
  gateSub: { fontSize: 11, marginTop: 2 },
})
