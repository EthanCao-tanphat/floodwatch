# FloodWatch Web (PWA)

React + Vite + TypeScript + Tailwind + **MapLibre GL v5** + **Framer Motion**.
Mobile-first, Vietnamese-first UI. No mapping API keys required.

## Setup

```bash
npm install
cp .env.example .env.local
# only the backend URL matters; no map keys needed
npm run dev
```

Open `http://localhost:5173`.

## What the user sees

**Scene 1 — Network intro (2.8s)**
SVG animation. 8 data sources at the edges (Open-Meteo, VMHA, RainViewer, tide stations, OSM, UDI Maps, NOAA, riders) stream packets toward a central pulsing FloodWatch node. Cyber-monitoring aesthetic.

**Scene 2 — Globe with country pins**
MapLibre v5 globe projection. 6 country pins drop in: 🇻🇳 Vietnam (active, red, pulsing), 🇺🇸 USA, 🇮🇩 Indonesia, 🇵🇭 Philippines, 🇮🇳 India, 🇹🇭 Thailand (gray, "soon"). User clicks Vietnam pin or "Skip" → flyTo Vietnam → drop into Thu Duc. Auto-spin until user touches.

**Scene 3 — Main app**
Street map of HCMC. Tap to pick from/to. Hit "Kiểm tra ngập" → backend returns 30/60/90-min flood probability per route segment, color-coded. 📷 floating button → camera → Qwen-VL classifies depth.

Returning users skip Scenes 1+2 (stored in `localStorage`).

## Project layout

```
web/
├── src/
│   ├── App.tsx                       orchestrates network → globe → main
│   ├── main.tsx                      React entry
│   ├── index.css                     Tailwind + MapLibre + pin-pulse keyframes
│   ├── types.ts                      mirrors api/models.py
│   ├── api/client.ts                 typed fetch wrapper
│   └── components/
│       ├── NetworkIntro.tsx          scene 1: SVG data-streams
│       ├── GlobeIntro.tsx            scene 2: MapLibre globe + country pins
│       ├── MapView.tsx               scene 3 main map + coverage circles
│       ├── RouteInput.tsx            from/to picker
│       ├── RouteResults.tsx          per-segment results panel
│       ├── PhotoReport.tsx           camera → /report/depth
│       └── RiskBadge.tsx             color-coded risk pill
├── public/favicon.svg
├── index.html
├── vite.config.ts                    PWA plugin config
├── tailwind.config.js                risk-* palette + fade-in keyframes
└── tsconfig.json
```

## Env vars

| Var | Local | Prod |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | `https://<user>-floodwatch-api.hf.space` |

No mapping API keys. OpenFreeMap tiles are free + no auth.

## Deploy to Vercel

1. Push monorepo to GitHub.
2. Vercel → new project → import repo.
3. **Root directory: `web/`**.
4. Framework: Vite.
5. Env var: `VITE_API_BASE_URL` pointing at your HF Space.
6. Deploy.

## Replay the intro

Browser console on the deployed app:
```js
localStorage.removeItem('floodwatch.flyover.seen')
```
Refresh — full intro plays again. Useful for the demo video recording.

## State machine

```
       ┌────────────────┐
       │ NetworkIntro   │ ◄── first visit (2.8s)
       └────────┬───────┘
                │ auto onComplete
                ▼
       ┌────────────────┐
       │ GlobeIntro     │ ◄── pick country (Vietnam only active)
       └────────┬───────┘
                │ onEnterVietnam (flyTo Thu Duc)
                ▼
       ┌────────────────┐
       │ Main app       │ ◄── input → results / photo
       └────────────────┘
```

## Time budget for Kalent

| Phase | Hours |
|---|---|
| `npm install`, run dev, see the default intro | 0.5 |
| Tune network intro: colors, labels, timing | 1.0 |
| Tune globe: pin positions, pulse color, auto-rotate speed | 1.0 |
| Stitch transitions, polish copy | 0.5 |
| Mobile testing + bug fixes | 1.0 |
| **Total** | **4.0** |

## Known caveats

- MapLibre v5 globe is ~6 months old; if the projection fails to load,
  the code silently falls back to mercator (still works, just no globe).
- Country pins use `map.project()` to compute screen positions; pins on the
  back of the globe are auto-hidden when off-canvas.
- Auto-rotate stops the moment the user touches the globe.
