# FloodWatch Architecture

## One-Sentence Positioning

FloodWatch is a 30-60 minute motorbike-passability forecasting platform for an HCMC pilot area. It differentiates from reactive incumbents such as UDI Maps, HSDC Maps, and Google Maps Flood by scoring risk on the rider's actual route using rainfall, tide, drainage proxy, historical hotspots, and crowdsourced passability reports.

## Four-Layer System

1. **External data sources** - Open-Meteo rainfall forecast, RainViewer radar tiles, Vung Tau tide tables, OpenStreetMap road network, static hotspot/drainage JSON, and rider photo reports.
2. **Backend** - FastAPI gateway plus specialist async agents for forecast, route scoring, photo passability, and alerts.
3. **Pydantic schemas** - typed contracts for risk score, passability, confidence, and evidence.
4. **Clients** - Rider PWA, lightweight B2B route-risk API, and public dashboard partnership surface.

## Agent Responsibilities

- **Forecast agent**: input `(lat, lng, horizon)`, output risk at 30/60 minutes. The MVP uses an explainable scoring/logistic model over rainfall, tide, drainage proxy, historical hotspot proximity, and rider reports.
- **Route agent**: input `(from, to, depart_time)`, samples route segments, calls the forecast agent, and returns route-level passability. GraphHopper road routing is optional; straight-line segment sampling is the demo fallback.
- **Photo/passability agent**: input `(image_base64, lat, lng)`, calls Qwen-VL and returns `{safe, slow_pass, avoid_for_motorbikes, impassable, unknown}` with confidence and reasoning. It verifies passability rather than claiming exact water depth.
- **Alert agent**: converts model outputs into rider-friendly recommendations. Rule-based text is enough for MVP; Qwen-Max can improve explanation quality later.

## Request Lifecycle: `POST /route/safe`

1. PWA sends origin and destination coordinates.
2. FastAPI validates payload and Vietnam bounds.
3. Route agent gets a real road route if GraphHopper is configured, otherwise uses sampled straight-line segments.
4. Forecast agent scores each segment at the 60-minute MVP horizon.
5. The response aggregates max segment risk into route risk, passability, confidence, evidence, and recommendation.
6. Frontend renders risky segments on MapLibre and shows the rider whether to continue, slow down, avoid, or delay.

## Why This Architecture Wins

- **Predictive vs reactive**: FloodWatch estimates when risk may hit a rider's route instead of only showing already-reported water.
- **Motorbike-first**: the product answers passability, not abstract flood depth.
- **Explainable**: risk evidence exposes rainfall, tide, hotspot proximity, drainage proxy, and rider-report signals.
- **Honest MVP**: Thu Duc / District 7 first, with 90-minute and nationwide prediction treated as roadmap.

## Tech Stack

| Layer | Choice |
|---|---|
| Backend framework | FastAPI |
| Async runtime | uvicorn + asyncio |
| AI | Qwen-VL for photo passability; Qwen-Max optional for alert copy |
| Data validation | Pydantic v2 |
| Backend host | Hugging Face Spaces |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Map | MapLibre GL JS + OpenFreeMap tiles |
| PWA | vite-plugin-pwa |
| Data store | JSON for MVP, Supabase Postgres post-MVP |
| Auth | None for MVP, Supabase Auth post-MVP for B2B API |

## Out Of Scope For MVP

- exact water-depth measurement from photos
- full ML rainfall radar model
- drainage system simulation
- 90-minute forecast as a core claim
- nationwide calibrated flood prediction
- B2B API authentication, billing, or rate limiting
- full safer-route generation if GraphHopper is unavailable
