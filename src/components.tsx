import React from "react"
import { View, Text, Image, StyleSheet } from "react-native"
import { useTheme, statusColor } from "./theme"
import type { Flight } from "./types"
import { delayMinutes, fmtDelay, fmtTime } from "./utils"

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

/** Pill displaying flight delay. Hidden when delay is ≤0 or the flight is cancelled. */
export const DelayBadge: React.FC<{ flight: Flight; threshold?: number }> = ({
  flight,
  threshold = 1,
}) => {
  const t = useTheme()
  const min = delayMinutes(flight)
  if (flight.status === "Cancelled" || min < threshold) return null
  const heavy = min >= 60
  const color = heavy ? t.danger : t.warning
  return (
    <View style={[styles.delayBadge, { backgroundColor: color }]}>
      <Text style={styles.delayBadgeText}>{fmtDelay(min)}</Text>
    </View>
  )
}

/**
 * Small ✈ icon rotated to the given heading (0 = north). The font glyph "✈"
 * naturally points to ~45° NE, so we subtract 45 to align it with the heading.
 */
export const DirectionalPlane: React.FC<{
  headingDeg?: number | null
  size?: number
  color?: string
}> = ({ headingDeg, size = 18, color }) => {
  const t = useTheme()
  const rot = headingDeg == null ? 0 : headingDeg - 45
  return (
    <Text
      style={{
        fontSize: size,
        lineHeight: size,
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
