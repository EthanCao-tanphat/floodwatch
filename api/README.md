# FloodWatch API

30-60 minute motorbike-passability risk for HCMC pilot routes.
Built for Asian Hackathon for Green Future 2026 (VinUniversity).

Endpoints:

- `POST /forecast/segment` - passability risk at 30/60 min for a coordinate
- `POST /route/safe` - A-to-B route with per-segment risk, passability, confidence, and evidence
- `POST /report/depth` - compatibility endpoint where Qwen-VL verifies photo-based passability

## Stack

FastAPI + Open-Meteo rainfall + Qwen-VL passability verification + optional Qwen-Max alert copy.

## Local Run

```bash
pip install -r requirements.txt
cp .env.example .env
# edit .env, put your real DASHSCOPE_API_KEY
python test_openmeteo.py
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000/docs to see the interactive Swagger UI.

## Test The Forecast Endpoint

```bash
curl -X POST http://localhost:8000/forecast/segment \
  -H "Content-Type: application/json" \
  -d '{"lat": 10.8506, "lng": 106.7714, "horizon_min": 60}'
```

Expected shape: forecast points for 30/60 min with `risk_score`, `risk_level`, `passability`, `confidence`, `evidence`, and explanation text.

## Test The Route Endpoint

```bash
curl -X POST http://localhost:8000/route/safe \
  -H "Content-Type: application/json" \
  -d '{
    "from": {"lat": 10.8506, "lng": 106.7714},
    "to":   {"lat": 10.7891, "lng": 106.8054}
  }'
```

## Deploy To Hugging Face Spaces

1. Create a new Space, SDK = Docker.
2. Add `DASHSCOPE_API_KEY` as a Space secret.
3. Push this directory to the Space repo.
4. HF Spaces will build the Dockerfile and expose port 7860.

## Project Layout

```text
floodwatch-api/
|-- main.py                  # FastAPI app + endpoints
|-- config.py                # env + Vietnam bounds + pilot city config
|-- models.py                # Pydantic schemas
|-- test_openmeteo.py        # data layer smoke test
|-- Dockerfile               # HF Spaces deploy
|-- requirements.txt
|-- agents/
|   |-- forecast.py          # explainable rainfall/tide/hotspot risk model
|   |-- route.py             # per-segment route scoring
|   `-- depth.py             # Qwen-VL passability verifier
|-- services/
|   |-- openmeteo.py         # 15-min rainfall API
|   |-- tides.py             # tide level, synthetic for MVP
|   `-- dashscope.py         # Qwen client
`-- data/
    `-- flood_points.json    # seed hotspots and drainage proxies
```

## What's A Stub Vs Real

| Component | Status |
|---|---|
| Open-Meteo | Real, works today, no API key needed |
| Fusion model | Real MVP scaffold, explainable and judge-defensible |
| Tide | Synthetic sinusoid, swap for Vung Tau scrape before final |
| Routing | GraphHopper if configured, straight-line sampling fallback |
| Qwen-VL passability | Real if Dashscope key is configured |
| Drainage scores | Static proxy, calibrate from UDI Maps history |
| Historical points | Seed hotspots, expand before final round |

Honest scoping beats overclaiming: this works for one HCMC pilot first, then scales as data quality improves.
