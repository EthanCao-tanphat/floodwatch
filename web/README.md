# FloodWatch Web

Mobile-first PWA frontend for FloodWatch.

Live app: https://floodwatch-one.vercel.app

FloodWatch Web lets Vietnamese riders search routes, compare flood-aware passability, inspect map evidence, and submit reports. It should always distinguish live/forecast evidence from historical susceptibility.

## Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- MapLibre GL
- Three.js globe intro
- Framer Motion
- Vite PWA

No map tile API key is required for the frontend. The deployed app needs a backend URL through `VITE_API_BASE_URL`.

## User Experience

The app is designed for phones first:

1. Landing/globe intro for first-time users.
2. Map-first dashboard.
3. Google Maps-style search and route entry.
4. Draggable bottom sheet for route input and route results.
5. Evidence markers:
   - `H`: historical susceptibility, not live flooding.
   - `R`: live rider report.
   - forecast/weather markers only when model evidence supports them.
6. Route results show passability, confidence, route details, and flood evidence without fake active-flood claims.

## Coverage Language

Frontend copy should match the backend evidence model:

| Label | Meaning |
|---|---|
| Live | Confirmed rider report or current evidence |
| Forecast | Forecast/model evidence |
| History | Historical susceptibility only |
| Unknown | Live/model data unavailable |

Do not show text like "wet segments", "detected flooding", "unsafe", or "avoid" unless the backend evidence supports that claim.

## Local Run

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`.

For local backend:

```text
VITE_API_BASE_URL=http://localhost:8000
```

## Production Deploy To Vercel

The repo root includes `vercel.json`, so Vercel can build from the monorepo root.

1. Import the GitHub repo in Vercel.
2. Use the Vite framework preset if Vercel detects it.
3. Set:

```text
VITE_API_BASE_URL=https://floodwatch-api.onrender.com
```

4. Deploy.
5. Open the deployed app and verify the API status pill is online.

Current live frontend:

```text
https://floodwatch-one.vercel.app
```

## Environment Variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_API_BASE_URL` | Yes | Backend API base URL |

No secret keys should be placed in frontend environment variables.

## Project Layout

```text
web/
|-- src/
|   |-- App.tsx
|   |-- api/client.ts
|   |-- components/
|   |   |-- DashboardShell.tsx
|   |   |-- FloatingPanel.tsx
|   |   |-- GlobeIntro.tsx
|   |   |-- MapView.tsx
|   |   |-- RouteInput.tsx
|   |   `-- RouteResults.tsx
|   |-- i18n/
|   |-- types.ts
|   `-- index.css
|-- public/
|-- index.html
|-- vite.config.ts
|-- tailwind.config.js
`-- package.json
```

## PWA Notes

- The app can be installed from mobile browsers as a PWA.
- After deployment, service worker cache can hold an older build. Hard refresh or reinstall the PWA if a mobile device does not show the latest UI.
- Production release should include privacy and safety pages before persistent rider-report storage is added.

## Market Pilot UX Priorities

For the first PWA pilot, prioritize:

- Route search under 3 seconds for common searches.
- Clean mobile bottom-sheet drag behavior.
- Clear distinction between live, forecast, history, and unknown evidence.
- Visible pilot safety/privacy copy.
- Wrong-prediction feedback that is stored separately from live flood reports.
- Vietnamese and English copy consistency.
- Rider report flow that is easy but does not overclaim report accuracy.
- Map-first interaction, with details available by pulling the sheet up.

## Checks

```bash
cd web
npm run build
```
