import React, { useEffect } from "react"
import { StatusBar } from "expo-status-bar"
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { Pressable, Text, useColorScheme, Platform } from "react-native"
import type { RootStackParamList } from "./src/navigation"
import { FlightsScreen } from "./src/screens/FlightsScreen"
import { FlightDetailScreen } from "./src/screens/FlightDetailScreen"
import { MapScreen } from "./src/screens/MapScreen"

const Stack = createNativeStackNavigator<RootStackParamList>()

const linking = {
  prefixes: [],
  config: {
    screens: {
      Flights: "",
      FlightDetail: "flight/:flight",
      Map: "map",
    },
  },
}

const WEB_FONT_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'

const useWebFontSetup = () => {
  useEffect(() => {
    if (Platform.OS !== "web") return
    if (typeof document === "undefined") return
    // Load Inter + JetBrains Mono from Google Fonts so the font stack actually
    // resolves to the intended family on machines that don't have them installed.
    const preconnect1 = document.createElement("link")
    preconnect1.rel = "preconnect"
    preconnect1.href = "https://fonts.googleapis.com"
    const preconnect2 = document.createElement("link")
    preconnect2.rel = "preconnect"
    preconnect2.href = "https://fonts.gstatic.com"
    preconnect2.crossOrigin = "anonymous"
    const fontLink = document.createElement("link")
    fontLink.rel = "stylesheet"
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
    document.head.appendChild(preconnect1)
    document.head.appendChild(preconnect2)
    document.head.appendChild(fontLink)

    document.documentElement.style.fontFamily = WEB_FONT_STACK
    document.body.style.fontFamily = WEB_FONT_STACK
    const style = document.createElement("style")
    style.textContent = `
      html, body, #root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
      .plane-tooltip { background: rgba(15,23,42,0.94) !important; color: #f1f5f9 !important; border: 1px solid rgba(148,163,184,0.35) !important; box-shadow: 0 4px 14px rgba(0,0,0,0.35) !important; border-radius: 6px !important; padding: 8px 10px !important; }
      .plane-tooltip::before { border-top-color: rgba(15,23,42,0.94) !important; }
    `
    document.head.appendChild(style)
    return () => {
      preconnect1.remove()
      preconnect2.remove()
      fontLink.remove()
      style.remove()
    }
  }, [])
}

export default function App() {
  const scheme = useColorScheme()
  const isDark = scheme === "dark"
  useWebFontSetup()
  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme} linking={linking as any}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack.Navigator>
        <Stack.Screen
          name="Flights"
          component={FlightsScreen}
          options={({ navigation }) => ({
            title: "Letiště Praha (PRG)",
            headerRight: () => (
              <Pressable onPress={() => navigation.navigate("Map", undefined)} hitSlop={10}>
                <Text style={{ fontSize: 18 }}>🗺️</Text>
              </Pressable>
            ),
          })}
        />
        <Stack.Screen
          name="FlightDetail"
          component={FlightDetailScreen}
          options={({ route }) => ({ title: route.params.flight.number })}
        />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: "Live mapa kolem PRG" }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
