# FloodWatch

**FloodWatch** is a predictive flood-aware routing platform for Vietnamese motorbike riders.

Instead of only showing where flooding has already happened, FloodWatch estimates flood risk along a rider's route in the next 30–60 minutes and recommends whether the route is safe, slow-passable, risky for motorbikes, or should be delayed.

> Flood risk before it reaches your route.

---

## What FloodWatch does

FloodWatch helps riders answer one practical question:

> Will this route still be passable for my motorbike soon?

The app lets a user enter an origin and destination, then generates multiple route options. Each route is scored segment by segment using flood-risk evidence, and the user can compare options like Google Maps — but with flood risk, passability, and explanation.

---

## Core flow

1. User enters origin and destination.
2. FloodWatch generates route options.
3. Each route is split into scored segments.
4. Risky segments are highlighted on the map.
5. The app explains why a segment is risky.
6. The user receives a motorbike passability recommendation.

---

## Key features

- Vietnam-wide flood-aware routing with confidence tiers
- Google Maps-style selectable route options
- Segment-by-segment flood risk scoring
- Motorbike passability labels:
  - `safe`
  - `slow_pass`
  - `avoid_for_motorbikes`
  - `impassable`
  - `unknown`
- Clickable map segment evidence popups
- Historical flood hotspot layer
- Live rider report layer
- Rider photo report flow
- Rider reports can influence nearby route risk
- Draggable floating route panel
- Typed address, coordinate, and map-pick input support

---

## Coverage tiers

FloodWatch supports Vietnam-wide routing, but prediction confidence depends on available local evidence.

### Tier 1 — Full prediction

Current strongest pilot area:

- Ho Chi Minh City

Signals:

- Rainfall forecast
- Tide-pressure proxy
- Historical flood hotspots
- Drainage proxy
- Rider reports

### Tier 2 — Partial prediction

Examples:

- Da Nang
- Can Tho
- Hue
- Nha Trang
- Hanoi
- Hai Phong
- Vung Tau
- Bien Hoa

Signals:

- Rainfall forecast
- Coastal or tide-pressure signal where relevant
- Rider reports
- Limited local hotspot or drainage evidence

### Tier 3 — Rain-only warning

Anywhere else in Vietnam.

Signals:

- Real route
- Rainfall forecast
- Rider reports when available

---

## Data honesty

FloodWatch does **not** claim that every data layer is fully official or real-time nationwide.

| Layer | Current status |
|---|---|
| Base map | Real map data |
| Road routing | Real route geometry if GraphHopper is available |
| Rainfall forecast | Real Open-Meteo forecast, cached for stability |
| Rider reports | Real for current app/demo session |
| Photo report | Real image, AI-estimated passability |
| Flood risk score | Algorithmic prediction |
| Motorbike passability | Model-estimated |
| Hotspots | Curated / approximate pilot evidence |
| Drainage | Proxy, not official full network |
| Tide | Modeled tide-pressure proxy, not official station feed |

Best honest product statement:

> FloodWatch uses real routing and rainfall forecast data, then combines them with modeled tide pressure, curated flood-hotspot evidence, drainage proxy scores, and rider reports to estimate motorbike passability risk.

---

## Tech stack

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- MapLibre GL
- Three.js globe intro
- Framer Motion

### Backend

- FastAPI
- Python
- Pydantic
- httpx
- asyncio

### Data and AI

- GraphHopper Directions API
- Open-Meteo rainfall forecast
- Open-Meteo Marine tide-pressure proxy
- Qwen-VL for photo passability classification
- Local flood hotspot JSON
- In-memory rider reports for the demo

---

## Local setup

### Backend

```bash
cd ~/floodwatch/api
/usr/bin/python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd ~/floodwatch/web
npm install
npm run dev
```

---

## Production Deploy

Deploy the backend first, then deploy the frontend with the backend URL.

### Backend: Render

This repo includes [render.yaml](./render.yaml) for a Docker web service.

1. Push the repo to GitHub.
2. Render → New → Blueprint → select this repo.
3. Render will create `floodwatch-api` from `api/Dockerfile`.
4. Add secrets in Render:
   - `DASHSCOPE_API_KEY`
   - `GRAPHHOPPER_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
5. After deploy, copy the service URL, for example:

```text
https://floodwatch-api.onrender.com
```

The Dockerfile uses `${PORT:-7860}`, so it works on Render and still works on Hugging Face Spaces.

### Frontend: Vercel

This repo includes [vercel.json](./vercel.json), so Vercel can build from the monorepo root.

1. Vercel → Add New Project → import the GitHub repo.
2. Framework should resolve as Vite.
3. Add environment variable:

```text
VITE_API_BASE_URL=https://floodwatch-api.onrender.com
```

4. Deploy.

### Smoke Test

After both deploys:

```bash
curl https://floodwatch-api.onrender.com/
```

Then open the Vercel URL and check:

- map loads
- API status shows online
- route search returns route options
- route evidence shows rain / river / hotspot / rider-report signals honestly
