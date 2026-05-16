"""FloodWatch API — predictive flooded-road intel for Vietnam."""

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    DepthReportRequest,
    DepthReportResponse,
    ForecastRequest,
    ForecastResponse,
    RouteRequest,
    RouteResponse,
)
from agents.depth import classify_depth
from agents.forecast import forecast_segment
from agents.route import find_safe_route
from config import (
    PILOT_CITIES,
    VN_LAT_MAX,
    VN_LAT_MIN,
    VN_LNG_MAX,
    VN_LNG_MIN,
)
from services.coverage import resolve_coverage
from services.geocode import geocode_address
from services.openmeteo import fetch_rainfall, rainfall_in_window
from services.reports import add_report, count_reports, list_reports
from services.tides import get_tide_level


app = FastAPI(
    title="FloodWatch API",
    description="30-60 minute motorbike-passability risk for HCMC pilot routes.",
    version="0.2.1",
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


def _count_hotspots(city_id: str = "hcmc") -> int:
    path = Path(__file__).resolve().parent / "data" / "flood_points.json"

    try:
        data = json.loads(path.read_text())
        city = data.get("cities", {}).get(city_id, {})
        return len(city.get("hotspots", []))
    except Exception:
        return 0


@app.get("/")
async def health():
    return {
        "status": "ok",
        "service": "FloodWatch API",
        "version": "0.2.1",
    }


@app.get("/status")
async def status_endpoint():
    """Small dashboard status endpoint for the sidebar.

    This makes the UI stop showing static zeros.
    """

    rain_now_mm = 0.0
    tide_level_m = get_tide_level()

    try:
        # HCMC pilot center.
        rainfall_data = await fetch_rainfall(10.78, 106.70, hours_ahead=1)
        rain_now_mm = rainfall_in_window(rainfall_data, minutes_from_now=0)
    except Exception:
        # Do not break the whole dashboard if Open-Meteo rate-limits us.
        rain_now_mm = 0.0

    return {
        "active_reports": count_reports(),
        "flood_hotspots": _count_hotspots("hcmc"),
        "rain_now_mm": round(float(rain_now_mm), 1),
        "tide_level_m": round(float(tide_level_m), 2),
        "coverage_pct": 100,
        "pilot_city": "Ho Chi Minh City",
    }




@app.get("/geocode")
async def geocode_endpoint(q: str, limit: int = 5):
    """Resolve address/place text into coordinates.

    Supports HCMC/Vietnam place names for the route input box.
    Coordinate strings are parsed on the frontend before calling this.
    """

    query = (q or "").strip()

    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Query is too short.")

    try:
        return await geocode_address(query, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding failed: {e}")



@app.get("/map/evidence")
async def map_evidence_endpoint():
    """Return map-visible flood evidence: historical hotspots + live rider reports."""

    path = Path(__file__).resolve().parent / "data" / "flood_points.json"
    hotspots = []

    try:
        data = json.loads(path.read_text())
        city = data.get("cities", {}).get("hcmc", {})

        for item in city.get("hotspots", []):
            hotspots.append(
                {
                    "name": item.get("name", "Flood hotspot"),
                    "lat": float(item["lat"]),
                    "lng": float(item["lng"]),
                    "historical_freq": float(item.get("historical_freq", 0.5)),
                    "source": item.get("source", "curated"),
                    "coord_note": item.get("coord_note"),
                }
            )
    except Exception:
        hotspots = []

    return {
        "hotspots": hotspots,
        "reports": list_reports(),
    }

@app.get("/coverage")
async def coverage_info():
    """List pilot cities and tier definitions."""

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
        result = await classify_depth(req.image_base64, req.lat, req.lng)

        ACTIVE_REPORTS.append(
            {
                "lat": req.lat,
                "lng": req.lng,
                "passability": result.passability,
                "confidence": result.confidence,
            }
        )

        # Keep memory small during repeated demo testing.
        ACTIVE_REPORTS[:] = ACTIVE_REPORTS[-50:]

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Depth classification failed: {e}")


@app.get("/debug/coverage-point")
async def debug_coverage_point(lat: float, lng: float):
    _check_in_vietnam(lat, lng)
    return resolve_coverage(lat, lng)
