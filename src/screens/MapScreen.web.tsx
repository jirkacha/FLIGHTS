import React, { useEffect, useState, useMemo } from "react"
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme, Pressable } from "react-native"
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  CircleMarker,
  Polyline,
  useMap,
} from "react-leaflet"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme, statusColor, type Theme } from "../theme"
import { fetchLiveAircraft, type LiveAircraft } from "../opensky"
import { fetchAllFlights } from "../api"
import { buildMatchMap } from "../matchFlights"
import { getAirportCoords } from "../airports"
import { AirlineLogo, Chip } from "../components"
import type { Flight } from "../types"
import type { RootStackParamList } from "../navigation"
import { haversineKm, minutesUntil, PRG_COORDS, fmtTime, fmtDateShort } from "../utils"

type Nav = NativeStackNavigationProp<RootStackParamList, "Map">
type MapRoute = RouteProp<RootStackParamList, "Map">

const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <path fill="currentColor" stroke="rgba(0,0,0,0.45)" stroke-width="0.6" stroke-linejoin="round"
    d="M16 1.5 l1.6 9.4 12.4 6.2 v2.6 l-12.4 -3.7 -1 7.4 4.3 2.6 v2 l-5.0 -1.4 -5.0 1.4 v-2 l4.3 -2.6 -1 -7.4 -12.4 3.7 v-2.6 l12.4 -6.2 z"/>
</svg>`

const ICON_CACHE = new Map<string, L.DivIcon>()

const planeIcon = (heading = 0, color = "#666", selected = false) => {
  // 5° buckets keep cache small while the plane turns.
  const h = Math.round(heading / 5) * 5
  const key = `${h}-${color}-${selected}`
  const cached = ICON_CACHE.get(key)
  if (cached) return cached
  const size = selected ? 36 : 24
  const icon = L.divIcon({
    className: "plane-marker",
    html: `
      <div style="width:${size}px; height:${size}px; transform: translate(-50%, -50%) rotate(${h}deg); color:${color}; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.55));">
        ${PLANE_SVG}
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
  ICON_CACHE.set(key, icon)
  return icon
}

type Matched = {
  aircraft: LiveAircraft
  flight?: Flight
}

const eqAircraft = (prev: PlaneMarkerProps, next: PlaneMarkerProps) =>
  prev.aircraft.icao24 === next.aircraft.icao24 &&
  prev.aircraft.onGround === next.aircraft.onGround &&
  Math.abs(prev.aircraft.latitude - next.aircraft.latitude) < 0.0002 &&
  Math.abs(prev.aircraft.longitude - next.aircraft.longitude) < 0.0002 &&
  (prev.aircraft.headingDeg ?? 0) === (next.aircraft.headingDeg ?? 0) &&
  prev.selected === next.selected &&
  prev.color === next.color &&
  prev.flight?.id === next.flight?.id &&
  prev.flight?.status === next.flight?.status

type PlaneMarkerProps = {
  aircraft: LiveAircraft
  flight?: Flight
  selected: boolean
  color: string
  onToggle: () => void
}

const PlaneMarker: React.FC<PlaneMarkerProps> = React.memo(
  ({ aircraft: a, flight: f, selected, color, onToggle }) => {
    const hoverTitle = f?.number ?? a.callsign ?? a.icao24
    const hoverRoute = f
      ? f.direction === "arrival"
        ? `${f.counterpart.iata ?? f.counterpart.city ?? f.counterpart.name} → PRG`
        : `PRG → ${f.counterpart.iata ?? f.counterpart.city ?? f.counterpart.name}`
      : a.callsign
        ? "Tranzit"
        : ""
    return (
      <Marker
        position={[a.latitude, a.longitude]}
        icon={planeIcon(a.headingDeg, color, selected)}
        eventHandlers={{ click: onToggle }}
      >
        <Tooltip direction="top" offset={[0, -16]} opacity={0.96} sticky className="plane-tooltip">
          <div style={{ minWidth: 130, lineHeight: 1.35 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                letterSpacing: 0.3,
              }}
            >
              {hoverTitle}
            </div>
            {f && <div style={{ color: "#cbd5e1", fontSize: 11 }}>{f.airlineName}</div>}
            {hoverRoute && (
              <div style={{ fontWeight: 700, fontSize: 12, marginTop: 3 }}>{hoverRoute}</div>
            )}
            {f && (
              <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                {f.direction === "arrival" ? "Přílet " : "Odlet "}
                <strong>{fmtTime(f.actualTime ?? f.scheduledTime)}</strong>
                {(() => {
                  const m = minutesUntil(f.actualTime ?? f.scheduledTime)
                  return m >= 0 ? ` · za ${m} min` : ` · před ${-m} min`
                })()}
              </div>
            )}
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              Klikni pro detail →
            </div>
          </div>
        </Tooltip>
        {/* Popup zůstává jako fallback (např. pro mobilní web bez side panelu).
            Plný detail je v levém SelectedFlightPanel. */}
        <Popup autoClose={false} closeOnClick={false}>
          <div style={{ minWidth: 180, fontSize: 12 }}>
            <strong style={{ fontSize: 14 }}>{hoverTitle}</strong>
            {f && (
              <>
                <br />
                <span style={{ color: "#666" }}>{f.airlineName}</span>
                <br />
                <strong>{hoverRoute}</strong>
              </>
            )}
            <br />
            {a.onGround ? "🟢 Na zemi" : "🛫 Ve vzduchu"}
          </div>
        </Popup>
      </Marker>
    )
  },
  eqAircraft,
)
PlaneMarker.displayName = "PlaneMarker"

const MapController: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap()
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 200)
    return () => window.clearTimeout(id)
  }, [map])
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 8), { duration: 0.8 })
  }, [target, map])
  return null
}

// --- Side panel ------------------------------------------------------------

const SelectedFlightPanel: React.FC<{
  aircraft: LiveAircraft
  flight?: Flight
  t: Theme
  onClose: () => void
  onOpenDetail: (f: Flight) => void
}> = ({ aircraft: a, flight: f, t, onClose, onOpenDetail }) => {
  const distKm = haversineKm(PRG_COORDS[0], PRG_COORDS[1], a.latitude, a.longitude)
  const eta =
    f && !a.onGround ? minutesUntil(f.actualTime ?? f.scheduledTime) : null
  const counter = f?.counterpart
  const counterLabel = counter
    ? counter.iata
      ? `${counter.city ?? counter.name} (${counter.iata})`
      : (counter.city ?? counter.name)
    : null
  const statusBadgeColor = f ? statusColor(f.status, t) : t.textMuted
  const verticalArrow =
    a.verticalRateFpm != null && Math.abs(a.verticalRateFpm) >= 200
      ? a.verticalRateFpm > 0
        ? "↑"
        : "↓"
      : ""

  return (
    <View style={[panelStyles.panel, { backgroundColor: t.card, borderColor: t.border }]}>
      {/* Header */}
      <View style={panelStyles.header}>
        <View style={{ flex: 1 }}>
          <View style={panelStyles.headerRow}>
            {f && <AirlineLogo iata={f.airlineIata} size={28} />}
            <Text style={[panelStyles.flightNo, { color: t.accent, fontFamily: t.mono }]}>
              {f?.number ?? a.callsign ?? a.icao24}
            </Text>
            {f && (
              <View style={[panelStyles.statusPill, { borderColor: statusBadgeColor }]}>
                <Text style={[panelStyles.statusPillText, { color: statusBadgeColor }]}>
                  {f.status}
                </Text>
              </View>
            )}
          </View>
          {f ? (
            <Text style={[panelStyles.airline, { color: t.textMuted }]}>{f.airlineName}</Text>
          ) : (
            <Text style={[panelStyles.airline, { color: t.textMuted }]}>
              Tranzit · ADS-B {a.icao24}
            </Text>
          )}
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [
            panelStyles.closeBtn,
            { borderColor: t.border, opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Text style={{ color: t.textMuted, fontSize: 16, lineHeight: 16 }}>✕</Text>
        </Pressable>
      </View>

      {/* Route */}
      {f && counterLabel && (
        <View style={[panelStyles.routeBlock, { backgroundColor: t.cardTint, borderColor: t.border }]}>
          <View style={panelStyles.routeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[panelStyles.routeLabel, { color: t.textMuted }]}>
                {f.direction === "arrival" ? "Z" : "Praha"}
              </Text>
              <Text style={[panelStyles.routePlace, { color: t.text }]} numberOfLines={1}>
                {f.direction === "arrival" ? counterLabel : "Praha (PRG)"}
              </Text>
            </View>
            <Text style={[panelStyles.routeArrow, { color: t.accent }]}>→</Text>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={[panelStyles.routeLabel, { color: t.textMuted }]}>
                {f.direction === "arrival" ? "Praha" : "Do"}
              </Text>
              <Text
                style={[panelStyles.routePlace, { color: t.text, textAlign: "right" }]}
                numberOfLines={1}
              >
                {f.direction === "arrival" ? "Praha (PRG)" : counterLabel}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Time block */}
      {f && (
        <View style={panelStyles.timeBlock}>
          <View style={panelStyles.timeRow}>
            <Text style={[panelStyles.timeLabel, { color: t.textMuted }]}>
              {f.direction === "arrival" ? "Přílet:" : "Odlet:"}
            </Text>
            <View style={panelStyles.timeValues}>
              {f.actualTime ? (
                <>
                  <Text
                    style={[
                      panelStyles.timeSched,
                      { color: t.textMuted, fontFamily: t.mono },
                    ]}
                  >
                    {fmtTime(f.scheduledTime)}
                  </Text>
                  <Text
                    style={[
                      panelStyles.timeActual,
                      { color: t.text, fontFamily: t.mono },
                    ]}
                  >
                    {fmtTime(f.actualTime)}
                  </Text>
                </>
              ) : (
                <Text style={[panelStyles.timeActual, { color: t.text, fontFamily: t.mono }]}>
                  {fmtTime(f.scheduledTime)}
                </Text>
              )}
              <Text style={[panelStyles.timeDate, { color: t.textMuted, fontFamily: t.mono }]}>
                {fmtDateShort(f.actualTime ?? f.scheduledTime)}
              </Text>
            </View>
          </View>
          {eta != null && (
            <Text style={[panelStyles.etaText, { color: t.accent }]}>
              {eta >= 0 ? `za ${eta} min` : `před ${-eta} min`}
            </Text>
          )}
          {(f.terminal || f.gate) && (
            <View style={panelStyles.metaRow}>
              {f.terminal && (
                <Text style={[panelStyles.metaText, { color: t.text }]}>T{f.terminal}</Text>
              )}
              {f.gate && (
                <Text style={[panelStyles.metaText, { color: t.textMuted }]}>
                  Gate {f.gate}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Live ADS-B data */}
      <View style={[panelStyles.liveBlock, { borderColor: t.border }]}>
        <Text style={[panelStyles.sectionLabel, { color: t.textMuted }]}>LIVE DATA</Text>
        <View style={panelStyles.liveGrid}>
          <LiveStat
            label="Stav"
            value={a.onGround ? "Na zemi" : "Ve vzduchu"}
            t={t}
          />
          {a.altitudeFt != null && !a.onGround && (
            <LiveStat
              label="Výška"
              value={`${Math.round(a.altitudeFt).toLocaleString()} ft ${verticalArrow}`.trim()}
              sub={`${Math.round(a.altitudeFt * 0.3048).toLocaleString()} m`}
              t={t}
            />
          )}
          {a.groundSpeedKt != null && (
            <LiveStat
              label="Rychlost"
              value={`${Math.round(a.groundSpeedKt)} kt`}
              sub={`${Math.round(a.groundSpeedKt * 1.852)} km/h`}
              t={t}
            />
          )}
          <LiveStat
            label="Vzdálenost"
            value={`${Math.round(distKm)} km`}
            sub="od PRG"
            t={t}
          />
          {(a.description ?? a.aircraftType) && (
            <LiveStat label="Typ" value={(a.description ?? a.aircraftType)!} t={t} wide />
          )}
          {a.registration && <LiveStat label="Registrace" value={a.registration} t={t} />}
        </View>
      </View>

      {f && (
        <Pressable
          onPress={() => onOpenDetail(f)}
          style={({ pressed }) => [
            panelStyles.detailBtn,
            { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={panelStyles.detailBtnText}>Detail letu →</Text>
        </Pressable>
      )}
    </View>
  )
}

const LiveStat: React.FC<{
  label: string
  value: string
  sub?: string
  t: Theme
  wide?: boolean
}> = ({ label, value, sub, t, wide }) => (
  <View style={[panelStyles.statBox, wide && { flexBasis: "100%" }]}>
    <Text style={[panelStyles.statLabel, { color: t.textMuted }]}>{label}</Text>
    <Text style={[panelStyles.statValue, { color: t.text, fontFamily: t.mono }]}>{value}</Text>
    {sub && <Text style={[panelStyles.statSub, { color: t.textMuted }]}>{sub}</Text>}
  </View>
)

const panelStyles = StyleSheet.create({
  panel: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 340,
    maxHeight: "calc(100% - 24px)" as unknown as number,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    zIndex: 1100,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flightNo: { fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
  airline: { fontSize: 12, fontWeight: "500", marginTop: 4 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  routeBlock: { borderRadius: 8, borderWidth: 1, padding: 10 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginBottom: 2 },
  routePlace: { fontSize: 14, fontWeight: "700" },
  routeArrow: { fontSize: 18, fontWeight: "700" },

  timeBlock: { gap: 6 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeLabel: { fontSize: 12, fontWeight: "600" },
  timeValues: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  timeSched: { fontSize: 12, textDecorationLine: "line-through" },
  timeActual: { fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },
  timeDate: { fontSize: 11, fontWeight: "600" },
  etaText: { fontSize: 13, fontWeight: "700", textAlign: "right" },
  metaRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  metaText: { fontSize: 12, fontWeight: "600" },

  liveBlock: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  liveGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statBox: { flexBasis: "47%", flexGrow: 1, minWidth: 100 },
  statLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.4, marginBottom: 2 },
  statValue: { fontSize: 14, fontWeight: "700" },
  statSub: { fontSize: 10, fontWeight: "500", marginTop: 1 },

  detailBtn: {
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  detailBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
})

// --- Main screen -----------------------------------------------------------

type AircraftFilter = "all" | "arrival" | "departure" | "other"

const AIRCRAFT_FILTERS: { id: AircraftFilter; label: string }[] = [
  { id: "all", label: "Vše" },
  { id: "arrival", label: "🛬 Přílety" },
  { id: "departure", label: "✈ Odlety" },
  { id: "other", label: "Ostatní" },
]

export const MapScreen: React.FC = () => {
  const t = useTheme()
  const scheme = useColorScheme()
  const nav = useNavigation<Nav>()
  const route = useRoute<MapRoute>()
  const focusFlightId = route.params?.focusFlightId
  const [aircraft, setAircraft] = useState<LiveAircraft[]>([])
  const [flights, setFlights] = useState<{ arrivals: Flight[]; departures: Flight[] }>({
    arrivals: [],
    departures: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [satellite, setSatellite] = useState(false)
  const [showRadar, setShowRadar] = useState(true)
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>("all")

  useEffect(() => {
    let cancelled = false
    const loadAircraft = async () => {
      try {
        const ac = await fetchLiveAircraft()
        if (cancelled) return
        setAircraft(ac)
        setLastUpdate(new Date())
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const loadFlights = async () => {
      try {
        const fl = await fetchAllFlights()
        if (cancelled) return
        setFlights({ arrivals: fl.arrivals, departures: fl.departures })
      } catch {
        /* non-fatal */
      }
    }
    loadAircraft()
    loadFlights()
    const id = setInterval(loadAircraft, 3_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const matched: Matched[] = useMemo(() => {
    const all = [...flights.arrivals, ...flights.departures]
    const matches = buildMatchMap(aircraft, all)
    return aircraft.map((a) => ({ aircraft: a, flight: matches.get(a.icao24) }))
  }, [aircraft, flights])

  const matchedCount = useMemo(() => matched.filter((m) => m.flight).length, [matched])

  /**
   * Aircraft-level filter for what's drawn on the map. Buckets:
   *   - arrival  : matched to an arriving PRG flight, airborne
   *   - departure: matched to a departing PRG flight, airborne
   *   - other    : transit (no flight match) OR on the ground regardless of match
   *
   * Counts feed the chip labels so the user knows how many planes a filter
   * would surface before clicking it.
   */
  const bucketOf = (m: Matched): AircraftFilter => {
    if (m.aircraft.onGround) return "other"
    if (!m.flight) return "other"
    return m.flight.direction === "arrival" ? "arrival" : "departure"
  }

  const filterCounts = useMemo(() => {
    const c: Record<AircraftFilter, number> = { all: matched.length, arrival: 0, departure: 0, other: 0 }
    for (const m of matched) c[bucketOf(m)]++
    return c
  }, [matched])

  useEffect(() => {
    if (!focusFlightId) return
    const hit = matched.find((m) => m.flight?.id === focusFlightId)
    if (hit) {
      setSelectedIcao(hit.aircraft.icao24)
      setFlyTarget([hit.aircraft.latitude, hit.aircraft.longitude])
    }
  }, [focusFlightId, matched])

  const selectedMatched = useMemo(
    () => matched.find((m) => m.aircraft.icao24 === selectedIcao),
    [matched, selectedIcao],
  )

  const tileConfig = useMemo(() => {
    if (satellite) {
      return {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        labelsUrl:
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      }
    }
    return {
      url:
        scheme === "dark"
          ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      labelsUrl: null,
    }
  }, [satellite, scheme])

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.statusBar, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={styles.statusTopRow}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={[styles.statusText, { color: t.text }]}>
              ✈️ {aircraft.length} letadel{matchedCount > 0 && ` · ${matchedCount} spárováno`}
            </Text>
            {lastUpdate && (
              <Text style={[styles.statusSub, { color: t.textMuted }]}>
                Aktualizováno{" "}
                {lastUpdate.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                {" · radius 250 NM"}
              </Text>
            )}
            {focusFlightId && !matched.some((m) => m.flight?.id === focusFlightId) && (
              <Text style={[styles.statusSub, { color: t.warning }]}>
                Vybraný let není v ADS-B dosahu — zobrazena Praha
              </Text>
            )}
          </View>
          <View style={styles.controls}>
            <Pressable
              onPress={() => setShowRadar((v) => !v)}
              style={[
                styles.toggleBtn,
                {
                  borderColor: t.border,
                  backgroundColor: showRadar ? t.accent : t.cardTint,
                },
              ]}
            >
              <Text style={[styles.toggleBtnText, { color: showRadar ? "#fff" : t.text }]}>
                📡 Radar
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSatellite((v) => !v)}
              style={[
                styles.toggleBtn,
                {
                  borderColor: t.border,
                  backgroundColor: satellite ? t.accent : t.cardTint,
                },
              ]}
            >
              <Text style={[styles.toggleBtnText, { color: satellite ? "#fff" : t.text }]}>
                🛰 Satelit
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.filtersRow}>
          {AIRCRAFT_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              active={aircraftFilter === f.id}
              count={filterCounts[f.id]}
              onPress={() => setAircraftFilter(f.id)}
            />
          ))}
        </View>
        {error && <Text style={[styles.statusSub, { color: t.danger }]}>Chyba: {error}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        {loading && aircraft.length === 0 && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={t.accent} />
          </View>
        )}
        {selectedMatched && (
          <SelectedFlightPanel
            aircraft={selectedMatched.aircraft}
            flight={selectedMatched.flight}
            t={t}
            onClose={() => setSelectedIcao(null)}
            onOpenDetail={(f) => nav.navigate("FlightDetail", { flight: f })}
          />
        )}
        {/* @ts-ignore react-leaflet types */}
        <MapContainer
          center={PRG_COORDS}
          zoom={9}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <MapController target={flyTarget} />
          <TileLayer key={tileConfig.url} url={tileConfig.url} attribution={tileConfig.attribution} />
          {tileConfig.labelsUrl && (
            <TileLayer
              key={`labels-${tileConfig.labelsUrl}`}
              url={tileConfig.labelsUrl}
              attribution=""
              opacity={0.85}
            />
          )}
          <CircleMarker
            center={PRG_COORDS}
            radius={10}
            pathOptions={{ color: t.accent, fillColor: t.accent, fillOpacity: 0.6 }}
          >
            <Popup>
              <strong>Letiště Praha (PRG)</strong>
              <br />
              Václav Havel Airport
            </Popup>
          </CircleMarker>
          {matched.map(({ aircraft: a, flight: f }) => {
            const visible =
              aircraftFilter === "all" ||
              bucketOf({ aircraft: a, flight: f }) === aircraftFilter
            if (!visible) return null
            const color = a.onGround
              ? t.textMuted
              : f
                ? f.direction === "arrival"
                  ? t.success
                  : t.accent
                : t.warning
            const selected = selectedIcao === a.icao24
            const counterCoords = f ? getAirportCoords(f.counterpart.iata) : null
            return (
              <React.Fragment key={a.icao24}>
                {showRadar && f && !a.onGround && !selected && (
                  <Polyline
                    positions={[[a.latitude, a.longitude], PRG_COORDS]}
                    pathOptions={{
                      color,
                      weight: 1,
                      opacity: 0.35,
                      dashArray: "3 6",
                    }}
                  />
                )}
                {selected && counterCoords && f && (
                  <>
                    {f.direction === "arrival" ? (
                      <>
                        <Polyline
                          positions={[counterCoords, [a.latitude, a.longitude]]}
                          pathOptions={{ color, weight: 3, opacity: 0.9 }}
                        />
                        <Polyline
                          positions={[[a.latitude, a.longitude], PRG_COORDS]}
                          pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "8 8" }}
                        />
                      </>
                    ) : (
                      <>
                        <Polyline
                          positions={[PRG_COORDS, [a.latitude, a.longitude]]}
                          pathOptions={{ color, weight: 3, opacity: 0.9 }}
                        />
                        <Polyline
                          positions={[[a.latitude, a.longitude], counterCoords]}
                          pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "8 8" }}
                        />
                      </>
                    )}
                    <CircleMarker
                      center={counterCoords}
                      radius={8}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
                    >
                      <Popup>
                        <strong>
                          {f.counterpart.city ?? f.counterpart.name}
                          {f.counterpart.iata ? ` (${f.counterpart.iata})` : ""}
                        </strong>
                        <br />
                        {f.counterpart.name}
                      </Popup>
                    </CircleMarker>
                  </>
                )}
                <PlaneMarker
                  aircraft={a}
                  flight={f}
                  selected={selected}
                  color={color}
                  onToggle={() =>
                    setSelectedIcao((prev) => (prev === a.icao24 ? null : a.icao24))
                  }
                />
              </React.Fragment>
            )
          })}
        </MapContainer>
      </View>
    </View>
  )
}

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={[styles.legendLabel, { color: "#666" }]}>{label}</Text>
  </View>
)
LegendDot.displayName = "LegendDot"

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 10,
  },
  statusTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusSub: { fontSize: 11 },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  legend: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11 },
  controls: { flexDirection: "row", gap: 6 },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toggleBtnText: { fontSize: 12, fontWeight: "600" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
})
