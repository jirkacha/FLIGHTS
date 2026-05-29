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
import { useTheme } from "../theme"
import { StatusBadge, TimeDisplay } from "../components"

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

export const FlightsScreen: React.FC<Props> = ({ navigation }) => {
  const t = useTheme()
  const [direction, setDirection] = useState<FlightDirection>("departure")
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

  const filtered = useMemo(
    () => (statusFilter === "All" ? flights : flights.filter((f) => f.status === statusFilter)),
    [flights, statusFilter],
  )

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      {/* Direction toggle */}
      <View style={[styles.toggle, { backgroundColor: t.card, borderColor: t.border }]}>
        {(["departure", "arrival"] as FlightDirection[]).map((d) => {
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
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("FlightDetail", { flight: item })}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: t.card,
                  borderColor: t.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.cardLeft}>
                <TimeDisplay flight={item} />
                <Text style={[styles.flightNumber, { color: t.textMuted }]}>{item.number}</Text>
              </View>
              <View style={styles.cardMiddle}>
                <Text style={[styles.airport, { color: t.text }]} numberOfLines={1}>
                  {direction === "departure" ? "→ " : "← "}
                  {item.counterpart.city ?? item.counterpart.name}
                  {item.counterpart.iata ? ` (${item.counterpart.iata})` : ""}
                </Text>
                <Text style={[styles.airline, { color: t.textMuted }]} numberOfLines={1}>
                  {item.airlineName}
                </Text>
                <View style={{ marginTop: 4 }}>
                  <StatusBadge flight={item} />
                </View>
              </View>
              <View style={styles.cardRight}>
                {!!item.terminal && (
                  <Text style={[styles.gate, { color: t.text }]}>T{item.terminal}</Text>
                )}
                {!!item.gate && (
                  <Text style={[styles.gateSub, { color: t.textMuted }]}>Gate {item.gate}</Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
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
  card: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    alignItems: "center",
  },
  cardLeft: { minWidth: 70 },
  cardMiddle: { flex: 1 },
  cardRight: { alignItems: "flex-end", minWidth: 56 },
  flightNumber: { fontSize: 11, marginTop: 2 },
  airport: { fontSize: 15, fontWeight: "600" },
  airline: { fontSize: 12, marginTop: 2 },
  gate: { fontSize: 14, fontWeight: "600" },
  gateSub: { fontSize: 11, marginTop: 2 },
})
