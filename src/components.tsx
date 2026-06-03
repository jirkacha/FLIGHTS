import React from "react"
import { View, Text, Image, StyleSheet, Pressable } from "react-native"
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

/**
 * Compact pill-shaped filter chip — rectangular with rounded corners, not
 * a balloon. Optional trailing count.
 */
export const Chip: React.FC<{
  label: string
  active: boolean
  count?: number
  onPress: () => void
}> = ({ label, active, count, onPress }) => {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.base,
        {
          backgroundColor: active ? t.accent : t.card,
          borderColor: active ? t.accent : t.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          chipStyles.label,
          { color: active ? "#fff" : t.text },
        ]}
      >
        {label}
      </Text>
      {typeof count === "number" && (
        <Text
          style={[
            chipStyles.count,
            {
              color: active ? "rgba(255,255,255,0.85)" : t.textMuted,
              backgroundColor: active ? "rgba(255,255,255,0.18)" : t.cardTint,
              fontFamily: t.mono,
            },
          ]}
        >
          {count}
        </Text>
      )}
    </Pressable>
  )
}

const chipStyles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    height: 30,
  },
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0.1 },
  count: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    minWidth: 18,
    textAlign: "center",
  },
})

/** Segmented control toggle (two options). */
export const Toggle: React.FC<{
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}> = ({ options, value, onChange }) => {
  const t = useTheme()
  return (
    <View
      style={[toggleStyles.container, { backgroundColor: t.cardTint, borderColor: t.border }]}
    >
      {options.map((o) => {
        const active = o.id === value
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[
              toggleStyles.btn,
              active && { backgroundColor: t.accent, shadowOpacity: 0.15 },
            ]}
          >
            <Text style={[toggleStyles.label, { color: active ? "#fff" : t.text }]}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    // Explicit horizontal sizing — `alignSelf: "stretch"` is a no-op inside a row
    // parent, which caused buttons to collapse / overlap on web when the parent
    // used `flex-wrap: wrap`. Lock a sensible min width and don't shrink below it.
    minWidth: 260,
    flexShrink: 0,
  },
  btn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    // RN-Web sometimes positions the active background outside the row bounds
    // unless every button establishes its own positioning context.
    position: "relative",
  },
  label: { fontSize: 13, fontWeight: "600" },
})

/**
 * Horizontal route progress bar with a plane glyph at the current progress.
 * FR24-inspired. progress is 0..1.
 */
export const RouteProgress: React.FC<{
  progress: number
  color: string
  heading?: number | null
  showEndpoints?: boolean
}> = ({ progress, color, heading, showEndpoints = true }) => {
  const t = useTheme()
  const pct = Math.max(0, Math.min(1, progress))
  const rot = heading == null ? 0 : heading - 45
  return (
    <View style={routeStyles.wrap}>
      {showEndpoints && (
        <View style={[routeStyles.endpoint, { backgroundColor: color }]} />
      )}
      <View style={[routeStyles.track, { backgroundColor: t.border }]}>
        <View
          style={[
            routeStyles.fill,
            { width: `${pct * 100}%`, backgroundColor: color },
          ]}
        />
        <View
          style={[
            routeStyles.dot,
            { left: `${pct * 100}%`, backgroundColor: t.card, borderColor: color },
          ]}
        >
          <Text
            style={{
              color,
              fontSize: 11,
              lineHeight: 11,
              transform: [{ rotate: `${rot}deg` }],
            }}
          >
            ✈
          </Text>
        </View>
      </View>
      {showEndpoints && (
        <View
          style={[
            routeStyles.endpoint,
            { backgroundColor: pct >= 1 ? color : t.border },
          ]}
        />
      )}
    </View>
  )
}

const routeStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  endpoint: { width: 6, height: 6, borderRadius: 3 },
  track: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    position: "relative",
    justifyContent: "center",
  },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 1 },
  dot: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    marginLeft: -9,
    alignItems: "center",
    justifyContent: "center",
  },
})

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
