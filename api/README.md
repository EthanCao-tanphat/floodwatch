# FloodWatch API

Predictive flooded-road intel for HCMC motorbike riders.
Built for Asian Hackathon for Green Future 2026 (VinUniversity).

Endpoints:
- `POST /forecast/segment` — flood probability at 30/60/90 min for a coordinate
- `POST /route/safe` — A→B route with per-segment risk
- `POST /report/depth` — Qwen-VL classifies a rider photo

## Stack
FastAPI + Open-Meteo (rainfall) + Qwen-VL (depth) + Qwen-Max (reasoning).

## Local run (Mac, Python 3.9+)

```bash
# 1. Install deps
pip install -r requirements.txt

# 2. Set up env
cp .env.example .env
# edit .env, put your real DASHSCOPE_API_KEY

# 3. Smoke test data layer FIRST
python test_openmeteo.py
# you should see rainfall numbers for Thu Duc

# 4. Run the API
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000/docs to see the interactive Swagger UI.

## Test the forecast endpoint

```bash
curl -X POST http://localhost:8000/forecast/segment \
  -H "Content-Type: application/json" \
  -d '{"lat": 10.8506, "lng": 106.7714, "horizon_min": 90}'
```

Should return a JSON with 3 forecast points (30/60/90 min) and an explanation.

## Test the route endpoint

```bash
curl -X POST http://localhost:8000/route/safe \
  -H "Content-Type: application/json" \
  -d '{
    "from": {"lat": 10.8506, "lng": 106.7714},
    "to":   {"lat": 10.7891, "lng": 106.8054}
  }'
```

## Deploy to Hugging Face Spaces (same as Healix)

1. Create a new Space, SDK = Docker.
2. Add `DASHSCOPE_API_KEY` as a Space secret (Settings → Variables and secrets).
3. Push this directory to the Space repo.
4. HF Spaces will build the Dockerfile and expose port 7860.

## Project layout

```
floodwatch-api/
├── main.py                  # FastAPI app + 3 endpoints
├── config.py                # env + HCMC bbox
├── models.py                # Pydantic schemas
├── test_openmeteo.py        # data layer smoke test
├── Dockerfile               # HF Spaces deploy
├── requirements.txt
├── .env.example
├── agents/
│   ├── forecast.py          # fusion model (rainfall + tide + drainage + history)
│   ├── route.py             # per-segment route scoring
│   └── depth.py             # Qwen-VL depth classifier
├── services/
│   ├── openmeteo.py         # 15-min rainfall API
│   ├── tides.py             # tide level (synthetic for MVP)
│   └── dashscope.py         # Qwen-VL + Qwen-Max client (Singapore endpoint)
└── data/
    └── flood_points.json    # 10 seed hotspots in Thu Duc
```

## What's a stub vs real

| Component         | Status                                                         |
|-------------------|----------------------------------------------------------------|
| Open-Meteo        | Real — works today, no API key needed                          |
| Fusion model      | Real — logistic regression, defensible to judges               |
| Tide              | Synthetic sinusoid — swap for Vung Tau scrape before July      |
| Routing           | Straight-line sampling — swap for OSRM/GraphHopper before July |
| Qwen-VL depth     | Real — uses your Healix Dashscope account                      |
| Drainage scores   | Hardcoded per district — calibrate from UDI Maps history       |
| Historical points | 10 seed hotspots in Thu Duc — expand to 50+ before final round |

Honest scoping > overclaiming. Judges respect "this works for one district, here's how it scales" more than "we built a city-wide ML system in 5 days."
