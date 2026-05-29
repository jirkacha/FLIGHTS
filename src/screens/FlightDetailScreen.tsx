import React from "react"
import { ScrollView, View, Text, StyleSheet } from "react-native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../navigation"
import { useTheme } from "../theme"
import { StatusBadge } from "../components"

type Props = NativeStackScreenProps<RootStackParamList, "FlightDetail">

const fmtFull = (iso?: string) => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export const FlightDetailScreen: React.FC<Props> = ({ route }) => {
  const t = useTheme()
  const { flight } = route.params
  const delayMin =
    flight.actualTime && flight.scheduledTime
      ? Math.round(
          (new Date(flight.actualTime).getTime() - new Date(flight.scheduledTime).getTime()) /
            60_000,
        )
      : 0

  const rows: { label: string; value: string }[] = [
    { label: "Letadlo", value: flight.aircraftModel ?? "—" },
    { label: "Registrace", value: flight.aircraftReg ?? "—" },
    { label: "Terminál", value: flight.terminal ? `T${flight.terminal}` : "—" },
    { label: "Gate", value: flight.gate ?? "—" },
    { label: "Plánovaný čas", value: fmtFull(flight.scheduledTime) },
    {
      label: flight.direction === "arrival" ? "Skutečný přílet" : "Skutečný odlet",
      value: fmtFull(flight.actualTime),
    },
    {
      label: "Zpoždění",
      value: delayMin > 0 ? `+${delayMin} min` : delayMin < 0 ? `${delayMin} min` : "—",
    },
  ]

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container}>
      <View style={[styles.header, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.flightNo, { color: t.text }]}>{flight.number}</Text>
        <Text style={[styles.airline, { color: t.textMuted }]}>{flight.airlineName}</Text>
        <Text style={[styles.route, { color: t.text }]}>
          {flight.direction === "departure" ? "Praha (PRG) → " : "← Praha (PRG)"}
          {flight.direction === "departure"
            ? `${flight.counterpart.city ?? flight.counterpart.name}${flight.counterpart.iata ? ` (${flight.counterpart.iata})` : ""}`
            : ""}
        </Text>
        {flight.direction === "arrival" && (
          <Text style={[styles.route, { color: t.text }]}>
            {flight.counterpart.city ?? flight.counterpart.name}
            {flight.counterpart.iata ? ` (${flight.counterpart.iata})` : ""}
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          <StatusBadge flight={flight} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={[
              styles.row,
              i < rows.length - 1 && { borderBottomColor: t.border, borderBottomWidth: 1 },
            ]}
          >
            <Text style={[styles.rowLabel, { color: t.textMuted }]}>{r.label}</Text>
            <Text style={[styles.rowValue, { color: t.text }]}>{r.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },
  header: { padding: 16, borderRadius: 12, borderWidth: 1 },
  flightNo: { fontSize: 28, fontWeight: "700" },
  airline: { fontSize: 14, marginTop: 2 },
  route: { fontSize: 16, fontWeight: "600", marginTop: 8 },
  card: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600" },
})
