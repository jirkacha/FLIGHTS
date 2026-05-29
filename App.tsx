import React from "react"
import { StatusBar } from "expo-status-bar"
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { useColorScheme } from "react-native"
import type { RootStackParamList } from "./src/navigation"
import { FlightsScreen } from "./src/screens/FlightsScreen"
import { FlightDetailScreen } from "./src/screens/FlightDetailScreen"

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function App() {
  const scheme = useColorScheme()
  const isDark = scheme === "dark"
  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack.Navigator>
        <Stack.Screen
          name="Flights"
          component={FlightsScreen}
          options={{ title: "Letiště Praha (PRG)" }}
        />
        <Stack.Screen
          name="FlightDetail"
          component={FlightDetailScreen}
          options={({ route }) => ({ title: route.params.flight.number })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
