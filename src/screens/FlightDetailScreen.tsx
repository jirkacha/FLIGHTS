import React, { useEffect, useState } from "react"
import { ScrollView, View, Text, StyleSheet, Pressable, Image, Linking } from "react-native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../navigation"
import { useTheme } from "../theme"
import { StatusBadge, AirlineLogo } from "../components"
import { fetchLiveAircraft, type LiveAircraft } from "../opensky"
import { matchFlightToAircraft } from "../matchFlights"
import { fetchAircraftPhoto, type AircraftPhoto } from "../planespotters"
import {
  aircraftCategory,
  aircraftCategoryLabel,
  estimateDurationMin,
  fmtDuration,
  haversineKm,
  PRG_COORDS,
} from "../utils"
import { getAirportCoords } from "../airports"

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

const PRG: [number, number] = PRG_COORDS

export const FlightDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const t = useTheme()
  const { flight } = route.params
  const [live, setLive] = useState<LiveAircraft | null>(null)
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const all = await fetchLiveAircraft()
        if (cancelled) return
        const matched = all.find((a) => matchFlightToAircraft(a, [flight]) === flight)
        setLive(matched ?? null)
      } catch {
        /* ignore live failure */
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [flight])

  // Fetch aircraft photo by registration (prefers live ADS-B reg if known).
  useEffect(() => {
    let cancelled = false
    const reg = live?.registration ?? flight.aircraftReg
    if (!reg) return
    fetchAircraftPhoto(reg).then((p) => {
      if (!cancelled) setPhoto(p)
    })
    return () => {
      cancelled = true
    }
  }, [live?.registration, flight.aircraftReg])

  const delayMin =
    flight.actualTime && flight.scheduledTime
      ? Math.round(
          (new Date(flight.actualTime).getTime() - new Date(flight.scheduledTime).getTime()) /
            60_000,
        )
      : 0

  const distKm = live ? haversineKm(PRG[0], PRG[1], live.latitude, live.longitude) : null

  const counterCoords = getAirportCoords(flight.counterpart.iata)
  const routeKm = counterCoords
    ? haversineKm(counterCoords[0], counterCoords[1], PRG[0], PRG[1])
    : null
  const estDurationMin = routeKm ? estimateDurationMin(routeKm) : null

  const category = aircraftCategory(flight.aircraftModel, flight.airlineIata, flight.airlineIcao)

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container}>
      <View style={[styles.header, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={styles.headerTop}>
          <AirlineLogo iata={flight.airlineIata} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flightNo, { color: t.text }]}>{flight.number}</Text>
            <Text style={[styles.airline, { color: t.textMuted }]}>{flight.airlineName}</Text>
          </View>
          <StatusBadge flight={flight} />
        </View>

        <View style={styles.routeBox}>
          <View style={styles.routeEnd}>
            <Text style={[styles.routeIata, { color: t.text }]}>
              {flight.direction === "departure" ? "PRG" : flight.counterpart.iata ?? "—"}
            </Text>
            <Text style={[styles.routeCity, { color: t.textMuted }]}>
              {flight.direction === "departure" ? "Praha" : flight.counterpart.city ?? flight.counterpart.name}
            </Text>
          </View>
          <View style={styles.routeArrow}>
            <Text style={{ color: t.textMuted, fontSize: 20 }}>✈</Text>
            <View style={[styles.routeLine, { backgroundColor: t.border }]} />
          </View>
          <View style={styles.routeEnd}>
            <Text style={[styles.routeIata, { color: t.text }]}>
              {flight.direction === "departure" ? flight.counterpart.iata ?? "—" : "PRG"}
            </Text>
            <Text style={[styles.routeCity, { color: t.textMuted }]}>
              {flight.direction === "departure" ? flight.counterpart.city ?? flight.counterpart.name : "Praha"}
            </Text>
          </View>
        </View>
      </View>

      {live && (
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.success, borderWidth: 2 }]}>
          <View style={styles.liveHeader}>
            <Text style={[styles.liveTitle, { color: t.success }]}>🛰️ LIVE poloha</Text>
            <Pressable onPress={() => navigation.navigate("Map", { focusFlightId: flight.id })}>
              <Text style={[styles.linkText, { color: t.accent }]}>Na mapu →</Text>
            </Pressable>
          </View>
          <DetailRow
            label={live.onGround ? "Na zemi" : "Výška"}
            value={
              live.altitudeFt != null
                ? `${Math.round(live.altitudeFt).toLocaleString()} ft (${Math.round(live.altitudeFt * 0.3048).toLocaleString()} m)`
                : "—"
            }
            t={t}
          />
          <DetailRow
            label="Rychlost"
            value={
              live.groundSpeedKt != null
                ? `${Math.round(live.groundSpeedKt)} kt (${Math.round(live.groundSpeedKt * 1.852)} km/h)`
                : "—"
            }
            t={t}
          />
          <DetailRow
            label="Vzdálenost od PRG"
            value={distKm != null ? `${Math.round(distKm)} km` : "—"}
            t={t}
          />
          {live.headingDeg != null && (
            <DetailRow label="Směr letu" value={`${Math.round(live.headingDeg)}°`} t={t} />
          )}
          <DetailRow
            label="Pozice"
            value={`${live.latitude.toFixed(3)}, ${live.longitude.toFixed(3)}`}
            t={t}
            last
          />
        </View>
      )}

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>LET</Text>
        <DetailRow label="Plánovaný čas" value={fmtFull(flight.scheduledTime)} t={t} />
        <DetailRow
          label={flight.direction === "arrival" ? "Skutečný přílet" : "Skutečný odlet"}
          value={fmtFull(flight.actualTime)}
          t={t}
        />
        <DetailRow
          label="Zpoždění"
          value={delayMin > 0 ? `+${delayMin} min` : delayMin < 0 ? `${delayMin} min` : "—"}
          t={t}
          highlight={delayMin >= 60 ? t.danger : delayMin >= 15 ? t.warning : delayMin < 0 ? t.success : undefined}
        />
        <DetailRow
          label="Vzdálenost (great-circle)"
          value={routeKm != null ? `${Math.round(routeKm).toLocaleString()} km` : "—"}
          t={t}
        />
        <DetailRow
          label="Odhad délky letu"
          value={estDurationMin ? `~ ${fmtDuration(estDurationMin)}` : "—"}
          t={t}
          last
        />
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>LETIŠTĚ</Text>
        <DetailRow label="Terminál" value={flight.terminal ? `T${flight.terminal}` : "—"} t={t} />
        <DetailRow label="Gate" value={flight.gate ?? "—"} t={t} last />
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, overflow: "hidden" }]}>
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>LETADLO</Text>
        {photo?.large ? (
          <Pressable onPress={() => photo.link && Linking.openURL(photo.link)}>
            <Image
              source={{ uri: photo.large }}
              style={styles.aircraftPhoto}
              resizeMode="cover"
            />
            {photo.photographer && (
              <Text style={[styles.photoCredit, { color: t.textMuted }]}>
                © {photo.photographer} (Planespotters.net)
              </Text>
            )}
          </Pressable>
        ) : null}
        <DetailRow label="Model" value={flight.aircraftModel ?? "—"} t={t} />
        <DetailRow label="Kategorie" value={aircraftCategoryLabel(category)} t={t} />
        <DetailRow label="Registrace" value={live?.registration ?? flight.aircraftReg ?? "—"} t={t} last />
      </View>
    </ScrollView>
  )
}

const DetailRow: React.FC<{
  label: string
  value: string
  t: ReturnType<typeof useTheme>
  last?: boolean
  highlight?: string
}> = ({ label, value, t, last, highlight }) => (
  <View
    style={[
      styles.row,
      !last && { borderBottomColor: t.border, borderBottomWidth: 1 },
    ]}
  >
    <Text style={[styles.rowLabel, { color: t.textMuted }]}>{label}</Text>
    <Text style={[styles.rowValue, { color: highlight ?? t.text }]}>{value}</Text>
  </View>
)

const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },
  header: { padding: 16, borderRadius: 12, borderWidth: 1 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  flightNo: { fontSize: 24, fontWeight: "700" },
  airline: { fontSize: 13, marginTop: 2 },
  routeBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(127,127,127,0.2)",
  },
  routeEnd: { flex: 1, alignItems: "center" },
  routeIata: { fontSize: 22, fontWeight: "700", letterSpacing: 1 },
  routeCity: { fontSize: 12, marginTop: 2 },
  routeArrow: { flex: 1.2, alignItems: "center" },
  routeLine: { height: 1, width: "80%", marginTop: 4 },
  card: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 0 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1, paddingVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600", textAlign: "right", flex: 1, marginLeft: 8 },
  liveHeader: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  liveTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  linkText: { fontSize: 13, fontWeight: "600" },
  aircraftPhoto: {
    alignSelf: "stretch",
    height: 180,
    marginHorizontal: -14,
    marginTop: -8,
    marginBottom: 8,
    backgroundColor: "rgba(127,127,127,0.1)",
  },
  photoCredit: {
    fontSize: 10,
    paddingBottom: 8,
    textAlign: "right",
  },
})
