"""FloodWatch API — predictive flooded-road intel for Vietnam.

Tiered coverage:
  Tier 1 — HCMC (full multi-feature fusion)
  Tier 2 — Hanoi, Da Nang, Can Tho, Hue (rainfall + tide)
  Tier 3 — anywhere else in Vietnam (rainfall-only warning)

Endpoints:
  GET  /                    health check
  GET  /coverage            list of pilot cities and tiers
  POST /forecast/segment    flood probability at 30/60/90 min for a coordinate
  POST /route/safe          route from A to B with per-segment risk
  POST /report/depth        Qwen-VL classifies a rider photo
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    ForecastRequest,
    ForecastResponse,
    RouteRequest,
    RouteResponse,
    DepthReportRequest,
    DepthReportResponse,
)
from agents.forecast import forecast_segment
from agents.route import find_safe_route
from agents.depth import classify_depth
from services.coverage import resolve_coverage
from config import (
    VN_LAT_MIN, VN_LAT_MAX, VN_LNG_MIN, VN_LNG_MAX, PILOT_CITIES,
)

app = FastAPI(
    title="FloodWatch API",
    description="Predictive flooded-road intel for Vietnam. Asian Hackathon for Green Future 2026.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_in_vietnam(lat: float, lng: float) -> None:
    if not (VN_LAT_MIN <= lat <= VN_LAT_MAX and VN_LNG_MIN <= lng <= VN_LNG_MAX):
        raise HTTPException(
            status_code=400,
            detail=f"Coordinate ({lat}, {lng}) is outside Vietnam.",
        )


@app.get("/")
async def health():
    return {"status": "ok", "service": "FloodWatch API", "version": "0.2.0"}


@app.get("/coverage")
async def coverage_info():
    """List of pilot cities, tier definitions. Frontend uses this to render coverage labels."""
    return {
        "tiers": {
            "1": "Full multi-feature flood prediction",
            "2": "Rainfall + tide-based flood prediction",
            "3": "Rainfall-only heavy-rain warning",
        },
        "pilot_cities": [
            {
                "id": cid,
                "name_vi": meta["name_vi"],
                "name_en": meta["name_en"],
                "center": {"lat": meta["center"][0], "lng": meta["center"][1]},
                "radius_km": meta["radius_km"],
                "tier": meta["tier"],
                "coastal": meta["coastal"],
            }
            for cid, meta in PILOT_CITIES.items()
        ],
    }


@app.post("/forecast/segment", response_model=ForecastResponse)
async def forecast_endpoint(req: ForecastRequest):
    _check_in_vietnam(req.lat, req.lng)
    try:
        return await forecast_segment(req.lat, req.lng, req.horizon_min)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {e}")


@app.post("/route/safe", response_model=RouteResponse)
async def route_endpoint(req: RouteRequest):
    _check_in_vietnam(req.from_.lat, req.from_.lng)
    _check_in_vietnam(req.to.lat, req.to.lng)
    try:
        return await find_safe_route(req.from_, req.to, req.depart_at_min)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route failed: {e}")


@app.post("/report/depth", response_model=DepthReportResponse)
async def depth_endpoint(req: DepthReportRequest):
    _check_in_vietnam(req.lat, req.lng)
    try:
        return await classify_depth(req.image_base64, req.lat, req.lng)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Depth classification failed: {e}")
