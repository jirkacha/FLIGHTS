# PRG Flights

Mobile + web app showing **arrivals and departures** at Václav Havel Airport Prague (PRG).
Built with [Expo](https://expo.dev) (React Native + React Native Web) and TypeScript — one codebase for iOS, Android and the web.

## Quick start

```bash
npm install
npm run web      # opens http://localhost:8081 in your browser
npm run ios      # iOS simulator (macOS only)
npm run android  # Android emulator
```

To run on a **real phone**: install **Expo Go** from the App Store / Play Store, run `npx expo start`, scan the QR code.

## Flight data

By default the app uses **mock data** so you can see it working immediately. To get **real PRG flights**, register a free key:

1. Sign up at <https://rapidapi.com/auth/sign-up> (Google login works).
2. Visit <https://rapidapi.com/aedbx-aedbx/api/aerodatabox> → **Subscribe to Test** → choose the free **Basic** plan (500 req/month).
3. Copy your `X-RapidAPI-Key`.
4. Create a `.env` file in the project root:

```env
EXPO_PUBLIC_RAPIDAPI_KEY=your_key_here
```

5. Restart `npm run web` (env vars are baked at build time).

## Features

- ✈️ Arrivals / Departures toggle
- 🎚️ Filter by status (Scheduled, Boarding, Delayed, Cancelled, …)
- 🔄 Pull-to-refresh + auto-refresh every 60 seconds
- 🔎 Tap a flight for full detail (aircraft, terminal, gate, delay)
- 🌗 Automatic dark mode

## Deploy

### Web — Vercel (free)

```bash
npm install -g vercel
npm run build:web     # see scripts in package.json once added
vercel
```

Or run `npx expo export --platform web` and deploy the generated `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

### Mobile — Expo Application Services (EAS)

```bash
npm install -g eas-cli
eas build --platform ios       # or android
eas submit                     # publish to stores
```

## Project structure

```
src/
  api.ts                 AeroDataBox client (mock fallback when no API key)
  mockData.ts            sample flights used in dev
  types.ts               shared TS types
  theme.ts               light/dark colors + status colors
  components.tsx         StatusBadge, TimeDisplay
  navigation.ts          stack param list
  screens/
    FlightsScreen.tsx    list with direction toggle + status filter
    FlightDetailScreen.tsx  full detail view
App.tsx                  navigation root
```
