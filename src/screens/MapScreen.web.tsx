import React, { useEffect, useState } from "react"
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme } from "react-native"
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "../theme"
import { fetchLiveAircraft, type LiveAircraft } from "../opensky"

const PRG_COORDS: [number, number] = [50.1008, 14.26]

const planeIcon = (heading = 0) =>
  L.divIcon({
    className: "plane-marker",
    html: `<div style="transform: rotate(${heading}deg); font-size: 22px; line-height: 22px;">✈️</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })

export const MapScreen: React.FC = () => {
  const t = useTheme()
  const scheme = useColorScheme()
  const [aircraft, setAircraft] = useState<LiveAircraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchLiveAircraft()
        if (!cancelled) {
          setAircraft(data)
          setLastUpdate(new Date())
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const tileUrl =
    scheme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.statusBar, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.statusText, { color: t.text }]}>
          ✈️ {aircraft.length} letadel kolem PRG
        </Text>
        {lastUpdate && (
          <Text style={[styles.statusSub, { color: t.textMuted }]}>
            Aktualizováno {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </Text>
        )}
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
          <TileLayer
            url={tileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {/* PRG marker */}
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
          {aircraft.map((a) => (
            <Marker
              key={a.icao24}
              position={[a.latitude, a.longitude]}
              icon={planeIcon(a.headingDeg)}
            >
              <Popup>
                <strong>{a.callsign ?? a.registration ?? a.icao24}</strong>
                <br />
                {a.description && <>{a.description}<br /></>}
                {!a.description && a.aircraftType && <>Typ: {a.aircraftType}<br /></>}
                {a.registration && a.callsign && <>Reg: {a.registration}<br /></>}
                {a.altitudeFt != null && (
                  <>Výška: {Math.round(a.altitudeFt).toLocaleString()} ft ({Math.round(a.altitudeFt * 0.3048)} m)<br /></>
                )}
                {a.groundSpeedKt != null && (
                  <>Rychlost: {Math.round(a.groundSpeedKt)} kt ({Math.round(a.groundSpeedKt * 1.852)} km/h)<br /></>
                )}
                {a.headingDeg != null && <>Směr: {Math.round(a.headingDeg)}°<br /></>}
                {a.squawk && <>Squawk: {a.squawk}<br /></>}
                {a.onGround ? "🟢 Na zemi" : "🛫 Ve vzduchu"}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusSub: { fontSize: 11 },
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
