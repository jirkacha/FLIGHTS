import React from "react"
import { View, Text, Image, StyleSheet } from "react-native"
import { useTheme, statusColor } from "./theme"
import type { Flight } from "./types"
import {
  aircraftCategory,
  aircraftIconSize,
  delayMinutes,
  fmtDelay,
  fmtTime,
  type AircraftCategory,
} from "./utils"

export const StatusBadge: React.FC<{ flight: Flight }> = ({ flight }) => {
  const t = useTheme()
  const color = statusColor(flight.status, t)
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{flight.status}</Text>
    </View>
  )
}

export const TimeDisplay: React.FC<{ flight: Flight; align?: "left" | "right" }> = ({
  flight,
  align = "left",
}) => {
  const t = useTheme()
  const delayed = !!flight.actualTime && flight.actualTime !== flight.scheduledTime
  return (
    <View style={{ alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <Text
        style={[
          styles.time,
          { color: t.text },
          delayed && { textDecorationLine: "line-through", color: t.textMuted },
        ]}
      >
        {fmtTime(flight.scheduledTime)}
      </Text>
      {delayed && (
        <Text style={[styles.time, { color: t.warning }]}>{fmtTime(flight.actualTime!)}</Text>
      )}
    </View>
  )
}

/** Pill displaying flight delay or early arrival. Hidden when delta is 0 or unknown. */
export const DelayBadge: React.FC<{ flight: Flight; threshold?: number }> = ({
  flight,
  threshold = 1,
}) => {
  const t = useTheme()
  const min = delayMinutes(flight)
  if (flight.status === "Cancelled") return null
  if (Math.abs(min) < threshold) return null
  let color = t.warning
  if (min < 0) color = t.success
  else if (min >= 60) color = t.danger
  else if (min < 15) color = "#ca8a04" // muted amber for minor delays
  return (
    <View style={[styles.delayBadge, { backgroundColor: color }]}>
      <Text style={styles.delayBadgeText}>{fmtDelay(min)}</Text>
    </View>
  )
}

/**
 * Plane glyph that scales with aircraft size category and rotates to heading.
 * Cargo aircraft get a small parcel decoration.
 */
export const AircraftIcon: React.FC<{
  flight: Flight
  headingDeg?: number | null
  color?: string
}> = ({ flight, headingDeg, color }) => {
  const t = useTheme()
  const cat = aircraftCategory(flight.aircraftModel, flight.airlineIata, flight.airlineIcao)
  const size = aircraftIconSize(cat)
  const isCargo = cat === "cargo"
  const tint = color ?? (isCargo ? t.warning : t.text)
  const rot = headingDeg == null ? 0 : headingDeg - 45
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Text
        style={{
          fontSize: size,
          lineHeight: size,
          color: tint,
          transform: [{ rotate: `${rot}deg` }],
        }}
      >
        ✈
      </Text>
      {isCargo && (
        <Text style={{ fontSize: Math.max(10, size - 8), lineHeight: size, marginLeft: -2 }}>📦</Text>
      )}
    </View>
  )
}

/** Backwards-compatible alias used by the map screen. */
export const DirectionalPlane: React.FC<{
  headingDeg?: number | null
  size?: number
  color?: string
  category?: AircraftCategory
}> = ({ headingDeg, size = 18, color, category }) => {
  const t = useTheme()
  const finalSize = category ? aircraftIconSize(category) : size
  const rot = headingDeg == null ? 0 : headingDeg - 45
  return (
    <Text
      style={{
        fontSize: finalSize,
        lineHeight: finalSize,
        color: color ?? t.textMuted,
        transform: [{ rotate: `${rot}deg` }],
      }}
    >
      ✈
    </Text>
  )
}

/**
 * Airline logo from Kiwi.com's free image CDN.
 * Falls back to a colored circle with IATA initials when no logo is found.
 */
export const AirlineLogo: React.FC<{ iata?: string; size?: number }> = ({ iata, size = 32 }) => {
  const t = useTheme()
  const [errored, setErrored] = React.useState(false)
  const code = iata?.toUpperCase()
  if (!code || errored) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: t.border },
        ]}
      >
        <Text style={[styles.fallbackText, { color: t.textMuted }]}>{code ?? "?"}</Text>
      </View>
    )
  }
  return (
    <Image
      source={{ uri: `https://images.kiwi.com/airlines/64/${code}.png` }}
      style={{ width: size, height: size, borderRadius: 6 }}
      resizeMode="contain"
      onError={() => setErrored(true)}
    />
  )
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  time: { fontSize: 16, fontWeight: "600" },
  fallback: { justifyContent: "center", alignItems: "center" },
  fallbackText: { fontSize: 11, fontWeight: "700" },
  delayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  delayBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
})
