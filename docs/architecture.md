# FloodWatch Architecture

## One-sentence positioning

FloodWatch is a 30/60/90-minute predictive flooded-road forecasting platform for HCMC,
differentiating from reactive incumbents (UDI Maps, HSDC Maps, Google Maps Flood)
through multi-agent AI fusion of rainfall, tide, drainage capacity, and crowdsourced
depth reports.

## Four-layer system

1. **External data sources** — Open-Meteo (15-min rainfall forecast, free, no key),
   RainViewer (radar map tiles, free non-commercial), Vung Tau tide tables,
   OpenStreetMap road network.
2. **Backend (FastAPI on Hugging Face Spaces)** — API gateway → 4 agents
   (Forecast, Route, Depth, Alert) → shared services (Qwen client, district
   data store, fusion math).
3. **Pydantic schemas** — typed contracts across every endpoint.
4. **Clients** — Rider PWA (Vercel, free B2C), B2B API (paid tier for Grab,
   ShopeeFood, Ahamove, J&T), Public Dashboard (UDC partnership channel).

## Multi-agent orchestration

Four specialist agents, defined cooperation pattern:

- **Forecast agent** — input `(lat, lng, horizon)`, output flood probability
  at 30/60/90 min. Internal model: logistic regression on 4 features
  (rainfall in 30-min window, tide factor, district drainage score, historical
  hotspot frequency). Coefficients calibrated against UDI Maps historical
  reports, methodology anchored in Scheiber et al. 2023 (NHESS) normalized
  flood severity index for HCMC.
- **Route agent** — input `(from, to, depart_time)`, samples 5 segments along
  the corridor, dispatches Forecast agent calls in parallel via `asyncio.gather`.
- **Depth agent** — input `(image_base64, lat, lng)`, calls Qwen-VL with a
  classification prompt. Returns one of `{dry, ankle, knee, impassable}` with
  confidence + reasoning.
- **Alert agent** — input forecast/route output, generates plain-English
  recommendation. Rule-based for MVP, Qwen-Max for final round.

## Request lifecycle (POST /route/safe)

1. PWA sends `{from, to}` coords over HTTPS.
2. FastAPI gateway validates payload + HCMC bbox.
3. Route agent samples 5 midpoints along the corridor.
4. Forecast agent runs in parallel for each segment (~600ms total, async).
5. Per-segment results aggregated; overall risk = max(segment_probs).
6. Alert agent generates natural-language recommendation.
7. RouteResponse returned to PWA, segments rendered on MapLibre layer.

## Why this architecture wins

- **Predictive vs reactive.** Every architectural choice serves 30–90 min
  forecasting, not current-state display. This is the UDI Maps differentiator.
- **Systems coordination.** Four specialist agents per request, mapping
  cleanly to ATM-style specialist controller coordination — judge-fit for
  Prof. Duong Nguyen Vu (ex-EUROCONTROL aerospace).
- **Honest scope, real scale path.** MVP on Thu Duc with JSON static data and
  segment-sampled routing. Same architecture scales to all HCMC districts (add
  more JSON), then SEA (regionalize fusion coefficients). Architecture is invariant.

## Tech stack (locked)

| Layer | Choice |
|---|---|
| Backend framework | FastAPI |
| Async runtime | uvicorn + asyncio |
| AI | Qwen-VL (depth) + Qwen-Max (alert, optional) via Dashscope SG |
| Data validation | Pydantic v2 |
| Backend host | Hugging Face Spaces (Docker SDK, port 7860) |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Map | MapLibre GL JS + OpenFreeMap tiles |
| PWA | vite-plugin-pwa |
| Frontend host | Vercel |
| Multi-agent | Plain `async def` + Pydantic (LangGraph deferred to post-MVP) |
| Data store | JSON in container for MVP, Supabase Postgres post-MVP |
| Auth | None for MVP, Supabase Auth post-MVP for B2B API |

## Out of scope for the 17 May submission

- Full ML rainfall radar model
- Real OSM routing (using straight-line segment sampling instead)
- Live tide scraper (using synthetic semi-diurnal sinusoid)
- Drainage system simulation
- Hotspot expansion beyond Thu Duc (10 seed hotspots only)
- B2B API authentication / rate limiting
- Multi-language UI (Vietnamese only for MVP)

All of these are itemized in the post-MVP scale plan in the proposal.
