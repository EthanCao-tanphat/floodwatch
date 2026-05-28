# FloodWatch Architecture

## 1. Product architecture summary

FloodWatch is a route-first flood-risk system. The main product flow is:

```text
User enters origin/destination
→ Backend gets route candidates
→ Each route is split into segments
→ Each segment is scored for flood risk and motorbike passability
→ UI highlights risky segments and explains the evidence
→ User can compare recommended, fastest, and alternative routes
```

The app is designed around a simple idea: routing should not only answer “which route is fastest?”, but also “which route is still passable for a motorbike during flood risk?”

## 2. High-level system diagram

```text
React/Vite frontend
  ├─ GlobeIntro
  ├─ RouteInput
  ├─ RouteChoices
  ├─ MapView
  ├─ RouteResults
  ├─ AlertsPanel
  ├─ LayersPanel
  ├─ PhotoReport
  └─ FloatingPanel
        │
        ▼
FastAPI backend
  ├─ /geocode
  ├─ /route/safe
  ├─ /forecast/segment
  ├─ /report/depth
  ├─ /map/evidence
  └─ /status
        │
        ▼
Agents and services
  ├─ route agent
  ├─ forecast agent
  ├─ photo/passability agent
  ├─ GraphHopper routing service
  ├─ Open-Meteo rainfall service
  ├─ tide-pressure service
  ├─ coverage tier service
  ├─ local rider report service
  └─ flood hotspot data
```

## 3. Frontend architecture

### `App.tsx`

Global controller for app state:

- Current scene: landing or dashboard.
- Active sidebar tab.
- Selected route origin/destination.
- Route response from backend.
- Selected route candidate ID.
- Map evidence: hotspots and rider reports.
- Layer toggles.
- Floating panel visibility.

### `MapView.tsx`

Responsible for map rendering:

- Main selected route segments.
- Clickable alternative routes.
- Segment number markers.
- Historical hotspot markers.
- Rider report markers.
- Popup evidence for clicked segments.
- Auto-fit/zoom behavior.

### `RouteInput.tsx`

Route input component:

- Supports typed coordinates.
- Supports typed place names through `/geocode`.
- Supports map picking.
- Supports current location.

### `RouteChoices.tsx`

Google Maps-style route selector:

- Recommended route.
- Fastest route.
- Safest/alternative routes.
- Coverage tier badge.
- Tradeoff summary.

### `RouteResults.tsx`

Explains the selected route:

- Overall passability.
- Recommendation.
- Main concern segment.
- Average rain.
- Tide pressure.
- Hotspot signal.
- Drainage risk.
- Per-segment evidence.

### `PhotoReport.tsx`

User uploads a road/flood photo:

- Photo is classified into passability categories.
- Report appears on the map.
- Report can affect nearby route segments.

### `FloatingPanel.tsx`

Draggable UI wrapper:

- Allows users to move the route/results panel.
- Prevents panel from blocking map context.
- Includes reset-to-top-right behavior.

## 4. Backend architecture

### `main.py`

FastAPI entrypoint. Exposes:

| Endpoint | Responsibility |
|---|---|
| `GET /` | Health check |
| `GET /status` | Dashboard stats |
| `GET /geocode` | Resolve typed place names |
| `GET /map/evidence` | Return hotspots and rider reports |
| `POST /route/safe` | Return route candidates and segment risk evidence |
| `POST /forecast/segment` | Forecast one coordinate |
| `POST /report/depth` | Classify rider photo/passability |

### `agents/route.py`

Core routing agent:

1. Requests route candidates from GraphHopper.
2. Splits each route into segments.
3. Scores each segment in parallel.
4. Applies nearby rider report evidence.
5. Ranks route candidates.
6. Returns recommended, fastest, and alternative routes.

### `agents/forecast.py`

Forecast fusion agent:

- Rainfall forecast.
- Tide-pressure signal.
- Hotspot proximity.
- Drainage proxy.
- Risk level.
- Passability class.
- Evidence object.

### `agents/depth.py`

Photo passability agent:

- Uses Qwen-VL/Dashscope when available.
- Fallback returns a safe non-crashing response.
- Output is passability-first, not exact water depth.

### `services/coverage_tiers.py`

Vietnam-wide confidence labeling:

- Tier 1: full HCMC pilot prediction.
- Tier 2: partial major-city prediction.
- Tier 3: rain-only fallback.

### `services/reports.py`

In-memory rider report store:

- Adds new reports.
- Lists reports for the map.
- Counts active reports.
- Calculates nearby report risk bonus for route segments.

### `services/openmeteo.py`

Rainfall forecast client:

- Fetches rainfall forecast.
- Caches results to reduce 429/rate-limit risk.
- Supports stale fallback for demo stability.

### `services/tides.py`

Tide-pressure signal:

- Uses modeled marine/tide-pressure signal where available.
- Falls back safely.
- Should be replaced with official tide feed for production.

### `services/geocode.py`

Geocoding service:

- Local HCMC aliases for demo-critical roads.
- Nominatim fallback for Vietnam-wide place search.

## 5. Route API contract

`POST /route/safe` returns backward-compatible selected route fields plus full route candidates.

Important response fields:

```ts
RouteResponse {
  distance_km
  eta_min
  segments
  overall_risk
  overall_passability
  confidence
  recommendation
  routes: RouteCandidate[]
  selected_route_id
  recommended_route_id
  fastest_route_id
  safest_route_id
  coverage
}
```

Each route candidate includes:

```ts
RouteCandidate {
  id
  label
  distance_km
  eta_min
  points
  segments
  overall_risk
  overall_passability
  confidence
  recommendation
  flood_prob_max
  is_recommended
  is_fastest
  is_safest
  tradeoff_summary
}
```

Each route segment includes:

```ts
RouteSegment {
  start
  end
  points
  flood_prob
  risk_score
  risk_level
  passability
  confidence
  evidence
}
```

Evidence includes:

```ts
RiskEvidence {
  rainfall_mm
  tide_level_m
  hotspot_proximity
  drainage_score
  report_count
  photo_confirmed
}
```

## 6. Coverage tier logic

### Tier 1 — Full prediction

HCMC pilot coverage:

```text
rainfall + tide pressure + hotspots + drainage proxy + rider reports
```

### Tier 2 — Partial prediction

Major cities/coastal/delta areas:

```text
rainfall + relevant tide/coastal signal + rider reports
```

### Tier 3 — Rain-only warning

Anywhere else in Vietnam:

```text
rainfall forecast + rider reports
```

## 7. Data honesty

FloodWatch is not claiming full official real-time flood data everywhere.

It uses:

- Real routing where GraphHopper is available.
- Real rainfall forecast through Open-Meteo.
- Modeled tide-pressure proxy.
- Source-labeled, curated hotspot data.
- Drainage proxy.
- Live user-submitted rider reports in the current session.
- Model-estimated passability.

## 8. Why this architecture works for the hackathon

The architecture is strong because it supports the judging story:

```text
This segment is risky.
Why?
Because the app can point to rain, tide pressure, hotspot history, drainage risk, and rider reports.
What should the rider do?
Continue, slow down, avoid, or delay.
```

## 9. Production roadmap

1. Replace in-memory reports with a database.
2. Replace proxy tide/drainage with official feeds where possible.
3. Expand source-labeled hotspot data across Vietnam.
4. Add Qwen-Max generated Vietnamese alerts.
5. Add offline-safe data caching.
6. Add stronger monitoring and API fallback handling.
