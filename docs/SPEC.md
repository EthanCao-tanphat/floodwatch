# FloodWatch MVP Spec

## Summary

FloodWatch tells riders when flood risk may hit their route and whether a motorbike can still pass.

The MVP is a Ho Chi Minh City pilot focused on Thu Duc and District 7. It estimates motorbike passability risk over the next 30-60 minutes using rainfall, tide, historical flood hotspots, drainage proxy data, and rider reports. The product is a route-aware decision tool, not a perfect citywide flood predictor.

The strongest demo is simple: a rider enters an origin and destination, FloodWatch scores risky road segments, explains the evidence, and recommends whether to continue, slow down, avoid a segment, or delay the trip.

## Product Surface

- Rider PWA: origin/destination selection, route risk, risky segment highlighting, recommendation text, and photo report upload.
- Photo report: Qwen-VL verifies road passability from a rider-submitted image. It does not claim exact water depth.
- B2B API/dashboard: route-risk scoring, high-risk zone awareness, ETA/order-assignment warnings, and delivery pause recommendations.
- Public dashboard: partnership surface for city agencies and drainage teams, positioned as a complement to UDI Maps rather than a replacement.

## Forecast Model

The MVP uses an explainable scoring/logistic model instead of LLM-based numerical prediction.

Core inputs:

- recent or forecast rainfall
- rainfall accumulation
- tide level
- historical flood hotspot proximity
- drainage proxy
- recent rider reports
- optional photo confirmation

Core outputs:

- `risk_score`: 0.0-1.0 segment flood risk
- `risk_level`: `low`, `moderate`, `high`, `severe`
- `passability`: `safe`, `slow_pass`, `avoid_for_motorbikes`, `impassable`, `unknown`
- `confidence`: `low`, `medium`, `high`
- `evidence`: rainfall, tide, hotspot proximity, report count, and photo confirmation when available
- `explanation`: rider-readable reason for the recommendation

Qwen-VL supports verification only. The forecast remains deterministic and explainable.

## API Contract

Keep the current endpoints, but align their semantics around motorbike passability.

- `POST /forecast/segment`: returns 30-60 minute forecast points for one coordinate. A 90-minute horizon may remain available as a stretch/roadmap mode, but MVP copy should emphasize 30-60 minutes.
- `POST /route/safe`: returns route segments with risk score, passability, confidence, and evidence. GraphHopper road routing is optional; straight-line segment sampling is the demo fallback.
- `POST /report/depth`: retained for compatibility, but treated as photo-based passability verification. A future rename to `/report/passability` is preferred.

Recommended passability categories:

- `safe`: road appears passable for normal motorbike travel
- `slow_pass`: shallow or uncertain water; pass slowly
- `avoid_for_motorbikes`: likely stall or safety risk for many motorbikes
- `impassable`: do not attempt
- `unknown`: insufficient evidence or low visual confidence

## Scope And Roadmap

MVP scope:

- Thu Duc or District 7 pilot
- 30-60 minute route-aware forecast
- motorbike passability language
- rider photo reports with Qwen-VL verification
- explainable risk evidence
- lightweight B2B route-risk response

Out of scope for MVP:

- exact water-depth measurement
- perfect citywide coverage
- nationwide flood prediction
- 90-minute forecast as a core claim
- drainage simulation
- B2B auth, billing, or rate limits

Roadmap:

- expand HCMC coverage as labelled flood data improves
- promote additional Vietnamese cities from heavy-rain warning to calibrated prediction
- add real safer-route alternatives
- add platform controls for order assignment, ETA adjustment, high-risk zones, and temporary delivery pauses
- port the model to Jakarta, Manila, and Bangkok with local rainfall, tide, road graph, and hotspot data

## Test Plan

Backend:

- Forecast endpoint returns risk, confidence, evidence, and explanation for HCMC coordinates.
- Route endpoint returns per-segment passability and an overall recommendation.
- Photo endpoint returns passability, confidence, and reasoning.
- Out-of-Vietnam coordinates return validation errors.

Frontend:

- User can select start/end points and receive a route-risk result.
- Risk segments render visibly on the map.
- Photo report flow handles success, low confidence, and API failure.
- Copy uses motorbike-passability language, not generic flood-depth language.

Demo acceptance:

- One scripted route from District 1, Thu Duc, or District 7 produces a clear warning for at least one risky segment.
- The demo can explain why the segment is risky using rainfall, tide, hotspot, report, or photo evidence.
- The pitch distinguishes FloodWatch from UDI Maps: UDI Maps shows where water has arrived; FloodWatch estimates when risk may hit the rider's route.
