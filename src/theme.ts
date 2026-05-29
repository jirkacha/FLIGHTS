import { useColorScheme } from "react-native"

export type Theme = {
  bg: string
  card: string
  border: string
  text: string
  textMuted: string
  accent: string
  danger: string
  warning: string
  success: string
}

const light: Theme = {
  bg: "#f6f7f9",
  card: "#ffffff",
  border: "#e3e6eb",
  text: "#0f172a",
  textMuted: "#64748b",
  accent: "#0066cc",
  danger: "#dc2626",
  warning: "#d97706",
  success: "#16a34a",
}

const dark: Theme = {
  bg: "#0b1220",
  card: "#121a2b",
  border: "#1f2a44",
  text: "#e5edff",
  textMuted: "#8aa0c5",
  accent: "#4d9aff",
  danger: "#f87171",
  warning: "#fbbf24",
  success: "#4ade80",
}

export const useTheme = (): Theme => {
  const scheme = useColorScheme()
  return scheme === "dark" ? dark : light
}

export const statusColor = (status: string, t: Theme): string => {
  const s = status.toLowerCase()
  if (s.includes("cancel")) return t.danger
  if (s.includes("delay")) return t.warning
  if (s.includes("arriv") || s.includes("depart") || s.includes("en route")) return t.success
  return t.textMuted
}
