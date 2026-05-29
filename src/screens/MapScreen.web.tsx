import React, { useEffect, useState, useMemo } from "react"
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme } from "react-native"
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from "react-leaflet"
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

const planeIcon = (heading = 0, color = "#666", label?: string, selected = false) => {
  const size = selected ? 36 : 26
  return L.divIcon({
    className: "plane-marker",
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -50%); pointer-events:auto;">
        <div style="width:${size}px; height:${size}px; transform: rotate(${heading}deg); color:${color}; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.5));">
          ${PLANE_SVG}
        </div>
        ${label ? `<div style="background:rgba(15,23,42,0.85); color:#fff; font-size:11px; padding:2px 6px; border-radius:4px; margin-top:3px; white-space:nowrap; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,0.3); letter-spacing:0.3px;">${label}</div>` : ""}
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

type Matched = {
  aircraft: LiveAircraft
  flight?: Flight
}

const MapController: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap()
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
    const id = setInterval(loadAircraft, 30_000)
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
  useEffect(() => {
    if (!focusFlightId) return
    const hit = matched.find((m) => m.flight?.id === focusFlightId)
    if (hit) {
      setSelectedIcao(hit.aircraft.icao24)
      setFlyTarget([hit.aircraft.latitude, hit.aircraft.longitude])
      return
    }
    // Not airborne — fall back to the counterpart airport so the user sees something.
    const all = [...flights.arrivals, ...flights.departures]
    const f = all.find((x) => x.id === focusFlightId)
    const c = f ? getAirportCoords(f.counterpart.iata) : null
    if (c) setFlyTarget(c)
  }, [focusFlightId, matched, flights])

  const tileUrl =
    scheme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.statusBar, { backgroundColor: t.card, borderColor: t.border }]}>
        <View>
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
        </View>
        <View style={styles.legend}>
          <LegendDot color={t.success} label="Přílet" />
          <LegendDot color={t.accent} label="Odlet" />
          <LegendDot color={t.textMuted} label="Tranzit" />
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
          <TileLayer
            url={tileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
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
            const color = f
              ? f.direction === "arrival"
                ? t.success
                : t.accent
              : t.textMuted
            const label = f ? f.number : a.callsign
            const selected = selectedIcao === a.icao24
            const counterCoords = f ? getAirportCoords(f.counterpart.iata) : null
            return (
              <React.Fragment key={a.icao24}>
                {selected && counterCoords && f && (
                  <>
                    {/* Completed segment: solid line from origin to current position (or PRG to current for departures) */}
                    {f.direction === "arrival" ? (
                      <>
                        <Polyline
                          positions={[counterCoords, [a.latitude, a.longitude]]}
                          pathOptions={{ color, weight: 3, opacity: 0.9 }}
                        />
                        {/* Remaining: dashed line to PRG */}
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
                    {/* Counterpart airport marker */}
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
                <Marker
                  position={[a.latitude, a.longitude]}
                  icon={planeIcon(a.headingDeg, color, label, selected)}
                  eventHandlers={{
                    click: () => setSelectedIcao(a.icao24),
                    popupclose: () => setSelectedIcao((prev) => (prev === a.icao24 ? null : prev)),
                  }}
                >
                <Popup>
                  <div style={{ minWidth: 200 }}>
                    <strong style={{ fontSize: 14 }}>
                      {f?.number ?? a.callsign ?? a.icao24}
                    </strong>
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
                        {f.terminal && (
                          <>
                            {" · "}T{f.terminal}
                          </>
                        )}
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
                        Rychlost: {Math.round(a.groundSpeedKt)} kt (
                        {Math.round(a.groundSpeedKt * 1.852)} km/h)
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
                          style={{ color: t.accent, fontWeight: 600 }}
                          onClick={(ev) => {
                            ev.preventDefault()
                            nav.navigate("FlightDetail", { flight: f })
                          }}
                        >
                          → Detail letu
                        </a>
                      </>
                    )}
                  </div>
                </Popup>
                </Marker>
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
  legend: { flexDirection: "row", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11 },
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
