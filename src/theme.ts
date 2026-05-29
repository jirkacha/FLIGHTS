import { useColorScheme, Platform } from "react-native"

export type Theme = {
  bg: string
  card: string
  cardTint: string
  border: string
  text: string
  textMuted: string
  accent: string
  danger: string
  warning: string
  success: string
  mono: string
}

const MONO = Platform.select({
  web: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  default: "Menlo",
}) as string

const light: Theme = {
  bg: "#f4f5f7",
  card: "#ffffff",
  cardTint: "#f8fafc",
  border: "#e2e6ec",
  text: "#0f172a",
  textMuted: "#64748b",
  accent: "#0b62d6",
  danger: "#dc2626",
  warning: "#d97706",
  success: "#16a34a",
  mono: MONO,
}

const dark: Theme = {
  bg: "#070d1a",
  card: "#101a2e",
  cardTint: "#0a1324",
  border: "#1c2842",
  text: "#e8efff",
  textMuted: "#8198be",
  accent: "#5aa1ff",
  danger: "#fb7185",
  warning: "#fbbf24",
  success: "#4ade80",
  mono: MONO,
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
