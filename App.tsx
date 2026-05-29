import React from "react"
import { StatusBar } from "expo-status-bar"
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { Pressable, Text, useColorScheme } from "react-native"
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

export default function App() {
  const scheme = useColorScheme()
  const isDark = scheme === "dark"
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
