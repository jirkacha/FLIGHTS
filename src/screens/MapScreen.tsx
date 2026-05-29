import React from "react"
import { View, Text, Linking, Pressable, StyleSheet } from "react-native"
import { useTheme } from "../theme"

/**
 * Native fallback — the real map (react-leaflet) only runs in the web bundle.
 * Metro picks MapScreen.web.tsx automatically for the web platform.
 */
export const MapScreen: React.FC = () => {
  const t = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Text style={[styles.emoji]}>🗺️</Text>
      <Text style={[styles.title, { color: t.text }]}>Live mapa</Text>
      <Text style={[styles.body, { color: t.textMuted }]}>
        Mapa s polohou letadel kolem PRG je zatím dostupná pouze ve webové verzi.
      </Text>
      <Pressable
        onPress={() => Linking.openURL("https://flights-flame.vercel.app/map")}
        style={[styles.btn, { backgroundColor: t.accent }]}
      >
        <Text style={styles.btnText}>Otevřít web verzi</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, textAlign: "center", marginBottom: 24, maxWidth: 320 },
  btn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "600" },
})
