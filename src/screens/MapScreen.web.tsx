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
import { useTheme } from "../theme"
import { fetchLiveAircraft, type LiveAircraft } from "../opensky"
import { fetchAllFlights } from "../api"
import { buildMatchMap } from "../matchFlights"
import { getAirportCoords } from "../airports"
import type { Flight } from "../types"
import type { RootStackParamList } from "../navigation"
import { haversineKm, minutesUntil, PRG_COORDS, fmtTime } from "../utils"

type Nav = NativeStackNavigationProp<RootStackParamList, "Map">
type MapRoute = RouteProp<RootStackParamList, "Map">

const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <path fill="currentColor" stroke="rgba(0,0,0,0.45)" stroke-width="0.6" stroke-linejoin="round"
    d="M16 1.5 l1.6 9.4 12.4 6.2 v2.6 l-12.4 -3.7 -1 7.4 4.3 2.6 v2 l-5.0 -1.4 -5.0 1.4 v-2 l4.3 -2.6 -1 -7.4 -12.4 3.7 v-2.6 l12.4 -6.2 z"/>
</svg>`

const ICON_CACHE = new Map<string, L.DivIcon>()

const planeIcon = (heading = 0, color = "#666", selected = false) => {
  // Round heading to 5° buckets so neighboring values share an icon and we
  // don't churn through 360 distinct cache entries while a plane turns.
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
  accent: string
  distKm: number
  onToggle: () => void
  onOpenDetail: (f: Flight) => void
}

const PlaneMarker: React.FC<PlaneMarkerProps> = React.memo(
  ({ aircraft: a, flight: f, selected, color, accent, distKm, onToggle, onOpenDetail }) => {
    const hoverTitle = f?.number ?? a.callsign ?? a.icao24
    const hoverRoute = f
      ? f.direction === "arrival"
        ? `${f.counterpart.iata ?? f.counterpart.name} → PRG`
        : `PRG → ${f.counterpart.iata ?? f.counterpart.name}`
      : a.callsign
        ? "Tranzit"
        : ""
    const hoverMeta = [
      !a.onGround && a.altitudeFt != null
        ? `${Math.round(a.altitudeFt).toLocaleString()} ft`
        : null,
      a.groundSpeedKt != null ? `${Math.round(a.groundSpeedKt)} kt` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    return (
      <Marker
        position={[a.latitude, a.longitude]}
        icon={planeIcon(a.headingDeg, color, selected)}
        eventHandlers={{ click: onToggle }}
      >
        <Tooltip direction="top" offset={[0, -16]} opacity={0.96} sticky className="plane-tooltip">
          <div style={{ minWidth: 140, lineHeight: 1.35 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {hoverTitle}
            </div>
            {f && <div style={{ color: "#94a3b8", fontSize: 11 }}>{f.airlineName}</div>}
            {hoverRoute && (
              <div style={{ fontWeight: 600, fontSize: 12, marginTop: 2 }}>{hoverRoute}</div>
            )}
            {f && (
              <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                {f.direction === "arrival" ? "Přistává " : "Odlétá "}
                <strong>{fmtTime(f.actualTime ?? f.scheduledTime)}</strong>
                {(() => {
                  const m = minutesUntil(f.actualTime ?? f.scheduledTime)
                  return m >= 0 ? ` (za ${m} min)` : ` (před ${-m} min)`
                })()}
              </div>
            )}
            {hoverMeta && (
              <div
                style={{
                  fontSize: 11,
                  color: "#cbd5e1",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  marginTop: 2,
                }}
              >
                {hoverMeta}
              </div>
            )}
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              {selected ? "Kliknutím skryješ trasu" : "Klikni pro trasu letu"}
            </div>
          </div>
        </Tooltip>
        <Popup autoClose={false} closeOnClick={false}>
          <div style={{ minWidth: 200 }}>
            <strong style={{ fontSize: 14 }}>{f?.number ?? a.callsign ?? a.icao24}</strong>
            {f && (
              <>
                <br />
                <span style={{ color: "#666" }}>{f.airlineName}</span>
                <br />
                <strong>
                  {f.direction === "arrival"
                    ? `${f.counterpart.city ?? f.counterpart.name} → Praha`
                    : `Praha → ${f.counterpart.city ?? f.counterpart.name}`}
                </strong>
                <br />
                {f.direction === "arrival" ? "Přistává:" : "Vzlétl:"}{" "}
                <strong>{fmtTime(f.actualTime ?? f.scheduledTime)}</strong>
                {f.direction === "arrival" && (
                  <>
                    {" "}
                    ({(() => {
                      const m = minutesUntil(f.actualTime ?? f.scheduledTime)
                      return m >= 0 ? `za ${m} min` : `před ${-m} min`
                    })()})
                  </>
                )}
                <br />
                Status: <strong>{f.status}</strong>
                {f.terminal && <> {" · "}T{f.terminal}</>}
                {f.gate && <> · Gate {f.gate}</>}
                <br />
              </>
            )}
            {(a.description ?? a.aircraftType) && (
              <>
                Typ: {a.description ?? a.aircraftType}
                <br />
              </>
            )}
            {a.registration && (
              <>
                Reg: {a.registration}
                <br />
              </>
            )}
            {a.altitudeFt != null && (
              <>
                Výška: {Math.round(a.altitudeFt).toLocaleString()} ft (
                {Math.round(a.altitudeFt * 0.3048).toLocaleString()} m)
                <br />
              </>
            )}
            {a.groundSpeedKt != null && (
              <>
                Rychlost: {Math.round(a.groundSpeedKt)} kt ({Math.round(a.groundSpeedKt * 1.852)} km/h)
                <br />
              </>
            )}
            Vzdálenost od PRG: {Math.round(distKm)} km
            <br />
            {a.onGround ? "🟢 Na zemi" : "🛫 Ve vzduchu"}
            {f && (
              <>
                <br />
                <a
                  href="#"
                  style={{ color: accent, fontWeight: 600 }}
                  onClick={(ev) => {
                    ev.preventDefault()
                    onOpenDetail(f)
                  }}
                >
                  → Detail letu
                </a>
              </>
            )}
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
  // Leaflet sometimes mounts with zero size when its container is inside a
  // flex layout — force a recompute shortly after mount so it actually
  // centers on PRG instead of drifting into the ocean.
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 200)
    return () => window.clearTimeout(id)
  }, [map])
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 8), { duration: 0.8 })
  }, [target, map])
  return null
}

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
        /* non-fatal — flights enrich the icons but the map still works */
      }
    }
    loadAircraft()
    loadFlights()
    // 3s strikes a balance between visible movement and adsb.lol update
    // cadence (their feed refreshes ~every 5s — anything faster just hammers
    // the API with duplicate data and trashes browser perf).
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

  // Auto-focus a flight passed via route params (e.g. tapping 🗺️ from the list).
  // If the flight isn't in ADS-B (out of range / on ground at a distant airport),
  // we DON'T pan to the counterpart airport — that's the bug the user reported.
  // We just stay at PRG and let them know the plane isn't visible.
  useEffect(() => {
    if (!focusFlightId) return
    const hit = matched.find((m) => m.flight?.id === focusFlightId)
    if (hit) {
      setSelectedIcao(hit.aircraft.icao24)
      setFlyTarget([hit.aircraft.latitude, hit.aircraft.longitude])
    }
  }, [focusFlightId, matched])

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
        <View style={{ flex: 1 }}>
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
            </Text>
          )}
          {focusFlightId && !matched.some((m) => m.flight?.id === focusFlightId) && (
            <Text style={[styles.statusSub, { color: t.warning }]}>
              Vybraný let není v ADS-B dosahu — zobrazena Praha
            </Text>
          )}
        </View>
        <View style={styles.legend}>
          <LegendDot color={t.success} label="Přílet PRG" />
          <LegendDot color={t.accent} label="Odlet PRG" />
          <LegendDot color={t.warning} label="Tranzit" />
          <LegendDot color={t.textMuted} label="Na zemi" />
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
        {error && <Text style={[styles.statusSub, { color: t.danger }]}>Chyba: {error}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        {loading && aircraft.length === 0 && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={t.accent} />
          </View>
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
            const distKm = haversineKm(PRG_COORDS[0], PRG_COORDS[1], a.latitude, a.longitude)
            // Color encodes state at a glance:
            //   green = arrival to PRG, blue = departure from PRG,
            //   yellow = airborne transit, gray = on ground.
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
                {/* Radar-style PRG connection line for matched airborne flights. */}
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
                  accent={t.accent}
                  distKm={distKm}
                  onToggle={() =>
                    setSelectedIcao((prev) => (prev === a.icao24 ? null : a.icao24))
                  }
                  onOpenDetail={(ff) => nav.navigate("FlightDetail", { flight: ff })}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
    flexWrap: "wrap",
  },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusSub: { fontSize: 11 },
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
