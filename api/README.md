# FloodWatch API

FastAPI backend for FloodWatch, a flood-aware route assistant for Vietnamese riders.

The API estimates route-level motorbike passability using forecast weather, route geometry, historical susceptibility, rider reports, and local proxy signals. It does not provide official emergency warnings.

## Deployment Status

The backend is designed to run on Render using the repo-level `render.yaml`.

Production-style URL example:

```text
https://floodwatch-api.onrender.com
```

Health checks:

```bash
curl https://floodwatch-api.onrender.com/
curl https://floodwatch-api.onrender.com/status
```

## Coverage Model

FloodWatch supports Vietnam-wide routing with confidence tiers:

| Tier | Area | Evidence |
|---|---|---|
| Tier 1 | Ho Chi Minh City pilot | Rainfall, tide-pressure proxy, historical susceptibility, drainage proxy, rider reports |
| Tier 2 | Selected Vietnam cities | Rainfall, rider reports, sparse hotspot/proxy data where available |
| Tier 3 | Rest of Vietnam | Rainfall forecast and rider reports only |

The API should label historical-only evidence as susceptibility, not live flooding.

## Core Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | `GET` | Health check |
| `/status` | `GET` | API status, evidence counts, runtime state |
| `/coverage` | `GET` | Coverage tiers and city context |
| `/map/evidence` | `GET` | Historical hotspots, rider reports, forecast markers |
| `/reports` | `GET` | Active, non-expired rider reports |
| `/forecast/segment` | `POST` | Risk forecast for one coordinate |
| `/api/search/suggest` | `GET` | Place suggestions |
| `/api/search/resolve` | `POST` | Resolve a place into coordinates |
| `/route/safe` | `POST` | Route options with segment evidence |
| `/report/depth` | `POST` | Photo-based passability report |
| `/feedback/wrong-prediction` | `POST` | Rider feedback for prediction calibration |

## Local Run

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://localhost:8000/docs` for Swagger.

## Environment Variables

| Variable | Required | Purpose |
|---|---:|---|
| `DASHSCOPE_API_KEY` | Yes for photo AI | Qwen-VL image passability classification |
| `DASHSCOPE_BASE_URL` | Yes for Dashscope | Dashscope API base URL |
| `GRAPHHOPPER_API_KEY` | Recommended | Real road routing |
| `GOOGLE_MAPS_API_KEY` | Recommended | Google Places search and address resolution |
| `DATABASE_URL` | Optional | Postgres storage for rider reports and wrong-prediction feedback |
| `REPORT_TTL_HOURS` | Optional | Active report expiry window, default `6` |
| `FLOODWATCH_DEMO_RAIN_MM` | Optional | Explicit demo-only rainfall override |

If `GRAPHHOPPER_API_KEY` is missing, routing can fall back to simplified geometry. That is useful for development but should not be presented as production-quality road routing.

If `DATABASE_URL` is missing or unavailable, the API falls back to in-memory report storage. That keeps local development simple, but reports will not survive process restarts.

## Example Requests

Forecast one point:

```bash
curl -X POST http://localhost:8000/forecast/segment \
  -H "Content-Type: application/json" \
  -d '{"lat": 10.8506, "lng": 106.7714, "horizon_min": 60}'
```

Route scoring:

```bash
curl -X POST http://localhost:8000/route/safe \
  -H "Content-Type: application/json" \
  -d '{
    "from": {"lat": 10.79987, "lng": 106.64790},
    "to": {"lat": 10.73867, "lng": 106.67993},
    "mode": "motorbike"
  }'
```

Map evidence:

```bash
curl "http://localhost:8000/map/evidence"
curl "http://localhost:8000/map/evidence?bbox=106.5,10.6,106.9,10.9"
```

## Evidence Semantics

The API uses explicit evidence language:

| Evidence state | Meaning |
|---|---|
| `live` | Confirmed rider report or current evidence exists |
| `forecast` | Weather/model forecast supports risk |
| `susceptibility` | Historical/proxy risk only |
| `unavailable` | Required live/model data is unavailable |

Rules:

- Historical hotspots can raise susceptibility, but do not prove current flooding.
- Unknown rider reports should not raise segment risk.
- Active-flood wording should only appear when live or forecast evidence supports it.
- Weather API failure should return low-confidence unavailable evidence, not invented moderate risk.

## Deploy To Render

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from the repo root.
3. Render reads `render.yaml` and builds `api/Dockerfile`.
4. Add secrets:
   - `DASHSCOPE_API_KEY`
   - `GRAPHHOPPER_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
5. Confirm:

```bash
curl https://floodwatch-api.onrender.com/
curl https://floodwatch-api.onrender.com/status
```

The Dockerfile uses `${PORT:-7860}`, so it works with Render's injected `PORT`.

## Data Sources And Limitations

| Component | Status |
|---|---|
| Open-Meteo rainfall | Real forecast data, cached |
| GraphHopper routing | Real road routing when key is configured |
| Google Places | Real search when key is configured |
| Qwen-VL photo passability | Real AI classification when Dashscope is configured |
| Historical hotspots | Curated seed/proxy data |
| Drainage | Proxy, not an official drainage network |
| Tide | Modeled pressure proxy, not an official tide station feed |
| Rider reports | Runtime app reports, not durable production storage yet |

Production readiness needs durable storage, monitoring, moderation, privacy policy, and stronger Vietnam data partnerships.

## Checks

```bash
cd api
python -m py_compile main.py models.py services/*.py agents/*.py
```
