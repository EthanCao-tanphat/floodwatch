# FloodWatch

FloodWatch is a deployed PWA that helps Vietnamese riders compare routes with flood-risk evidence before they ride.

Live app: https://floodwatch-one.vercel.app

FloodWatch is not an official emergency warning system. It is a route-level decision aid: it combines routing, rainfall forecast, rider reports, historical susceptibility, and local proxy signals to estimate whether a motorbike route may remain passable.

> Google Maps helps you find the route. FloodWatch helps you ask whether that route may still be motorbike-passable.

## What FloodWatch Does

FloodWatch helps riders answer one practical question:

> Will this route likely be passable for my motorbike soon?

The app lets a user enter an origin and destination, then returns route options with passability labels, map overlays, segment evidence, and confidence language. It is designed to be useful without pretending that every flood signal is live or official.

Core user flow:

1. Search for a place, use current location, or pick points on the map.
2. Choose a travel mode, with motorbike as the main pilot use case.
3. Check routes.
4. Compare fastest, safest, and alternative routes.
5. Open flood evidence and route details.
6. Submit rider reports when real road conditions differ from the model.

## Current Product Status

FloodWatch is ready for a PWA pilot, not a full public-safety launch.

| Area | Status |
|---|---|
| Frontend | Deployed on Vercel as a mobile-first PWA |
| Backend | Deployable on Render using `render.yaml` |
| Routing | Real road routing when GraphHopper is configured |
| Rainfall | Real forecast data from Open-Meteo, cached for stability |
| Evidence map | Vietnam-wide historical/proxy markers where seed data exists |
| Rider reports | Live in-app session reports, not durable production storage yet |
| Photo report | Qwen-VL passability classification when Dashscope is configured |
| Market readiness | Pilot-ready, but needs privacy, monitoring, durable reports, and stronger data partnerships before broader release |

## Coverage Tiers

FloodWatch can operate across Vietnam, but confidence depends on local evidence.

### Tier 1: Full Prediction

Current strongest pilot area:

- Ho Chi Minh City

Signals:

- Rainfall forecast
- Tide-pressure proxy
- Historical flood susceptibility hotspots
- Drainage proxy
- Rider reports
- Route segment scoring

### Tier 2: Partial Prediction

Example cities:

- Hanoi
- Da Nang
- Can Tho
- Hue
- Nha Trang
- Hai Phong
- Vung Tau
- Bien Hoa

Signals:

- Rainfall forecast
- Rider reports
- Sparse historical/proxy hotspot seed data where available
- Coastal or tide-pressure signals where relevant

### Tier 3: Forecast And Reports Only

Everywhere else in Vietnam.

Signals:

- Real route geometry when routing is available
- Rainfall forecast
- Rider reports when submitted

Tier 3 does not invent hotspot pins or claim active flooding without evidence.

## Data Honesty

FloodWatch separates active or forecast flood risk from historical susceptibility.

| Layer | Current status | How the app should phrase it |
|---|---|---|
| Base map | Real map tiles | Map context |
| Route geometry | Real when GraphHopper is configured | Route option |
| Rainfall forecast | Real Open-Meteo forecast | Forecast evidence |
| Rider reports | Real user-submitted reports in the current app runtime | Live report evidence |
| Photo report | Real uploaded image, AI-estimated passability | AI-assisted report |
| Hotspots | Curated seed/proxy historical evidence | Historical susceptibility, not live flooding |
| Drainage | Proxy score, not an official drainage network | Susceptibility modifier |
| Tide | Modeled tide-pressure proxy | Tide-pressure signal |
| Flood score | Algorithmic estimate | Model output with confidence |

Important limitations:

- FloodWatch is not official emergency advice.
- Historical hotspots do not prove current flooding.
- Forecast risk can be wrong, especially for short local storms.
- Rider reports should improve confidence, but require moderation and persistence before broad launch.
- Users should still follow local authorities and avoid unsafe roads.

Useful external references:

- Google Flood Hub is useful for flood awareness, but its FAQ says forecasts are informational and not a sole emergency source; it also has coverage limits around urban, coastal, and flash flood contexts: https://support.google.com/flood-hub/answer/15638004?hl=en
- Open-Meteo provides forecast variables such as precipitation that FloodWatch uses for rainfall evidence: https://open-meteo.com/en/docs
- GraphHopper provides routing APIs and quota/cost constraints that matter for production routing: https://docs.graphhopper.com/openapi/routing

## How To Use The Deployed App

1. Open https://floodwatch-one.vercel.app.
2. Tap the route button.
3. Enter a starting point and destination, or pick points on the map.
4. Tap "Check route".
5. Compare route options and read the evidence language carefully:
   - "Live" means rider-report or current/forecast evidence supports it.
   - "Forecast" means weather/model evidence supports it.
   - "History" means historical susceptibility only.
   - "Unknown" means live/model data is unavailable.
6. Do not treat historical-only warnings as confirmed flooding.

## Local Development

Backend:

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`.

## Environment Variables

Backend:

| Variable | Required | Purpose |
|---|---:|---|
| `DASHSCOPE_API_KEY` | Yes for photo AI | Qwen-VL image passability classification |
| `DASHSCOPE_BASE_URL` | Yes for Dashscope | Dashscope API base URL |
| `GRAPHHOPPER_API_KEY` | Recommended | Real road routing |
| `GOOGLE_MAPS_API_KEY` | Recommended | Google Places search and address resolution |
| `FLOODWATCH_DEMO_RAIN_MM` | Optional | Explicit demo-only rainfall override |

Frontend:

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_API_BASE_URL` | Yes | Public backend API URL |

Example production frontend value:

```text
VITE_API_BASE_URL=https://floodwatch-api.onrender.com
```

## Production Deployment

Deploy the backend first, then point the frontend at the backend URL.

### Backend: Render

This repo includes `render.yaml` for a Render Docker web service.

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Render creates `floodwatch-api` from `api/Dockerfile`.
4. Add backend secrets:
   - `DASHSCOPE_API_KEY`
   - `GRAPHHOPPER_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
5. Wait for the service to deploy.
6. Check health:

```bash
curl https://floodwatch-api.onrender.com/
curl https://floodwatch-api.onrender.com/status
```

### Frontend: Vercel

This repo includes `vercel.json`, so Vercel can build from the monorepo root.

1. Import the GitHub repo in Vercel.
2. Keep the project framework as Vite.
3. Add:

```text
VITE_API_BASE_URL=https://floodwatch-api.onrender.com
```

4. Deploy.
5. Open the Vercel app and confirm the API status is online.

## API Overview

Key endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /` | Backend health |
| `GET /status` | API status, evidence counts, runtime state |
| `GET /coverage` | Coverage tier information |
| `GET /map/evidence` | Historical/proxy hotspots, rider reports, and forecast warning markers |
| `POST /forecast/segment` | Forecast risk for one coordinate |
| `GET /api/search/suggest` | Place search suggestions |
| `POST /api/search/resolve` | Resolve a place into coordinates |
| `POST /route/safe` | Route options with segment-level evidence |
| `POST /report/depth` | Photo-based passability report |

## Market Pilot Roadmap

FloodWatch should enter the market as a PWA pilot first.

Initial audience:

- Ho Chi Minh City motorbike riders
- Students
- Delivery riders
- Daily commuters during heavy rain

Pilot goals:

- Prove that riders understand the evidence language.
- Keep route response time under 3 seconds for common searches.
- Collect rider reports and compare them against model output.
- Measure false warnings and missed warnings.
- Learn which UI states help riders make safer choices without panic.

Validation metrics:

- Route checks per day
- Completed route searches under 3 seconds
- Rider report submissions
- Report confirmation quality
- Repeat users during rain events
- False warning feedback
- Missed warning feedback

Market readiness blockers before a wider launch:

- Privacy policy
- Terms and safety disclaimer
- Production monitoring and incident alerts
- Durable report storage
- Report moderation
- Stronger Vietnam flood and drainage data partnerships
- Clearer confidence-tier education
- Cost plan for routing and place-search quotas
- App store review plan if moving beyond PWA

## Safety And Privacy Notes

- FloodWatch should never tell users that a road is guaranteed safe.
- The product should recommend caution when evidence is weak or unavailable.
- Photos and reports should be handled as sensitive location-linked data.
- Production launch needs a privacy policy before collecting persistent reports.
- Any app store release should include clear location, photo, and data retention disclosures.

## Tech Stack

Frontend:

- React
- Vite
- TypeScript
- Tailwind CSS
- MapLibre GL
- Three.js
- Framer Motion

Backend:

- FastAPI
- Python
- Pydantic
- httpx
- asyncio

Data and model services:

- GraphHopper Directions API
- Google Places / Maps API
- Open-Meteo forecast APIs
- Open-Meteo Marine / tide-pressure proxy
- Qwen-VL via Dashscope
- Local historical susceptibility seed data
- In-app rider reports

## Checks

Recommended checks before pushing:

```bash
cd api
python -m py_compile main.py models.py services/*.py agents/*.py

cd ../web
npm run build
```
