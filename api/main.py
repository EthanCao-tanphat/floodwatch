"""FloodWatch API — predictive flooded-road intel for Vietnam."""

import json
import os
import time
from pathlib import Path
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from models import (
    DepthReportRequest,
    DepthReportResponse,
    ForecastRequest,
    ForecastResponse,
    RouteRequest,
    RouteResponse,
    PlaceResolveRequest,
    PlaceResolveResponse,
    RiderReport,
    SearchSuggestion,
    WrongPredictionFeedbackRequest,
    WrongPredictionFeedbackResponse,
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
from services.openmeteo import fetch_rainfall, fetch_rainfall_many, rainfall_in_window, weather_cache_status
from services.reports import (
    add_prediction_feedback,
    add_report,
    count_reports,
    list_reports,
    report_store_mode,
    report_ttl_hours,
)
from services.tides import get_tide_level
from services.place_search import resolve_place, suggest_places


app = FastAPI(
    title="FloodWatch API",
    description="Pilot flood-aware route passability API for Vietnam.",
    version="0.3.0",
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


def _load_hotspot_evidence() -> List[dict[str, Any]]:
    path = Path(__file__).resolve().parent / "data" / "flood_points.json"
    hotspots: List[dict[str, Any]] = []

    try:
        data = json.loads(path.read_text())
        cities = data.get("cities", {})

        for city_id, city in cities.items():
            meta = PILOT_CITIES.get(city_id, {})
            city_name = meta.get("name_en") or city_id.replace("_", " ").title()

            for index, item in enumerate(city.get("hotspots", []), start=1):
                lat = float(item["lat"])
                lng = float(item["lng"])

                hotspots.append(
                    {
                        "id": f"{city_id}-hotspot-{index}",
                        "name": item.get("name", "Flood hotspot"),
                        "city_id": city_id,
                        "city_name": city_name,
                        "lat": lat,
                        "lng": lng,
                        "historical_freq": float(item.get("historical_freq", 0.5)),
                        "source": item.get("source", "curated"),
                        "coord_note": item.get("coord_note"),
                        "evidence_type": "historical_hotspot",
                        "evidence_state": "susceptibility",
                        "data_quality": item.get("data_quality", "curated_seed"),
                    }
                )
    except Exception:
        return []

    return hotspots


def _count_hotspots(city_id: Optional[str] = None) -> int:
    hotspots = _load_hotspot_evidence()

    if city_id is None:
        return len(hotspots)

    return len([item for item in hotspots if item.get("city_id") == city_id])


def _parse_bbox(bbox: Optional[str]) -> Optional[tuple[float, float, float, float]]:
    if not bbox:
        return None

    parts = [part.strip() for part in bbox.split(",")]

    if len(parts) != 4:
        raise HTTPException(
            status_code=400,
            detail="bbox must be min_lng,min_lat,max_lng,max_lat",
        )

    try:
        min_lng, min_lat, max_lng, max_lat = [float(part) for part in parts]
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="bbox must contain numeric values",
        ) from exc

    if min_lng > max_lng or min_lat > max_lat:
        raise HTTPException(
            status_code=400,
            detail="bbox minimums must be less than maximums",
        )

    return min_lng, min_lat, max_lng, max_lat


def _inside_bbox(item: dict[str, Any], bbox: tuple[float, float, float, float]) -> bool:
    min_lng, min_lat, max_lng, max_lat = bbox
    lat = float(item["lat"])
    lng = float(item["lng"])

    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng


WEATHER_WATCH_POINTS = [
    {"id": "hcmc", "name": "Ho Chi Minh City", "lat": 10.7769, "lng": 106.7009},
    {"id": "bienhoa", "name": "Bien Hoa", "lat": 10.9574, "lng": 106.8427},
    {"id": "vungtau", "name": "Vung Tau", "lat": 10.3460, "lng": 107.0843},
    {"id": "cantho", "name": "Can Tho", "lat": 10.0452, "lng": 105.7469},
    {"id": "rachgia", "name": "Rach Gia", "lat": 10.0125, "lng": 105.0809},
    {"id": "camau", "name": "Ca Mau", "lat": 9.1768, "lng": 105.1524},
    {"id": "danang", "name": "Da Nang", "lat": 16.0471, "lng": 108.2068},
    {"id": "hue", "name": "Hue", "lat": 16.4637, "lng": 107.5909},
    {"id": "quynhon", "name": "Quy Nhon", "lat": 13.7563, "lng": 109.2297},
    {"id": "nhatrang", "name": "Nha Trang", "lat": 12.2388, "lng": 109.1967},
    {"id": "dalat", "name": "Da Lat", "lat": 11.9404, "lng": 108.4583},
    {"id": "buonmathuot", "name": "Buon Ma Thuot", "lat": 12.6662, "lng": 108.0378},
    {"id": "hanoi", "name": "Hanoi", "lat": 21.0278, "lng": 105.8342},
    {"id": "haiphong", "name": "Hai Phong", "lat": 20.8449, "lng": 106.6881},
    {"id": "vinh", "name": "Vinh", "lat": 18.6796, "lng": 105.6813},
    {"id": "thainguyen", "name": "Thai Nguyen", "lat": 21.5942, "lng": 105.8482},
]

WEATHER_WATCH_CACHE_TTL_SECONDS = 600
_WEATHER_WATCH_CACHE: dict[str, Any] = {"updated_at": 0.0, "items": []}


def _rain_probability(open_meteo_data: dict[str, Any]) -> int:
    hourly = open_meteo_data.get("hourly", {})
    probs = hourly.get("precipitation_probability", []) or []
    values = [float(value) for value in probs[:2] if value is not None]

    if not values:
        return 0

    return int(round(max(values)))


def _weather_alert_level(rain_30m_mm: float, rain_90m_mm: float, probability_pct: int) -> str:
    peak_rain = max(rain_30m_mm, rain_90m_mm)

    if peak_rain >= 20 or probability_pct >= 85:
        return "high"

    if peak_rain >= 8 or probability_pct >= 65:
        return "moderate"

    return "watch"


async def _weather_watch_point(point: dict[str, Any]) -> Optional[dict[str, Any]]:
    try:
        data = await fetch_rainfall(point["lat"], point["lng"], hours_ahead=2)
    except Exception:
        return None

    return _weather_watch_point_from_data(point, data)


def _weather_watch_point_from_data(
    point: dict[str, Any],
    data: dict[str, Any],
) -> dict[str, Any]:
    rain_30m = rainfall_in_window(data, minutes_from_now=0)
    rain_90m = rainfall_in_window(data, minutes_from_now=60)
    probability = _rain_probability(data)

    return {
        "id": f"weather-{point['id']}",
        "name": point["name"],
        "lat": point["lat"],
        "lng": point["lng"],
        "rain_30m_mm": round(float(rain_30m), 1),
        "rain_90m_mm": round(float(rain_90m), 1),
        "precip_probability_pct": probability,
        "alert_level": _weather_alert_level(rain_30m, rain_90m, probability),
        "evidence_type": "rainfall_forecast",
        "evidence_state": "forecast",
        "source": data.get("source") or "Open-Meteo forecast",
        "updated_at": int(time.time()),
    }


async def _weather_watch_points() -> List[dict[str, Any]]:
    now = time.time()

    if now - float(_WEATHER_WATCH_CACHE["updated_at"]) < WEATHER_WATCH_CACHE_TTL_SECONDS:
        return list(_WEATHER_WATCH_CACHE["items"])

    try:
        forecasts = await fetch_rainfall_many(
            [(point["lat"], point["lng"]) for point in WEATHER_WATCH_POINTS],
            hours_ahead=2,
        )
        results = [
            _weather_watch_point_from_data(point, forecast)
            for point, forecast in zip(WEATHER_WATCH_POINTS, forecasts)
        ]
    except Exception:
        results = []

    items = [
        item
        for item in results
        if isinstance(item, dict)
    ]

    _WEATHER_WATCH_CACHE["updated_at"] = now
    _WEATHER_WATCH_CACHE["items"] = items

    return items


@app.get("/")
async def health():
    return {
        "status": "ok",
        "service": "FloodWatch API",
        "version": "0.3.0",
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
        "flood_hotspots": _count_hotspots(),
        "rain_now_mm": round(float(rain_now_mm), 1),
        "tide_level_m": round(float(tide_level_m), 2),
        "coverage_pct": 100,
        "pilot_city": "Vietnam coverage tiers",
        "report_store": report_store_mode(),
        "report_ttl_hours": report_ttl_hours(),
        "routing_provider": "graphhopper" if os.getenv("GRAPHHOPPER_API_KEY") else "fallback",
        "weather_cache": weather_cache_status(),
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
async def map_evidence_endpoint(
    bbox: Optional[str] = Query(
        default=None,
        description="Optional min_lng,min_lat,max_lng,max_lat filter.",
    ),
    include_weather: bool = Query(
        default=True,
        description="Include Open-Meteo rainfall watch points.",
    ),
):
    """Return map-visible flood evidence: historical hotspots + live rider reports."""

    bbox_filter = _parse_bbox(bbox)
    hotspots = _load_hotspot_evidence()
    reports = [
        {
            **report,
            "evidence_type": "live_report",
            "evidence_state": "live",
        }
        for report in list_reports()
    ]
    weather_alerts = await _weather_watch_points() if include_weather else []

    if bbox_filter is not None:
        hotspots = [item for item in hotspots if _inside_bbox(item, bbox_filter)]
        reports = [item for item in reports if _inside_bbox(item, bbox_filter)]
        weather_alerts = [item for item in weather_alerts if _inside_bbox(item, bbox_filter)]

    return {
        "hotspots": hotspots,
        "reports": reports,
        "weather_alerts": weather_alerts,
    }


@app.get("/reports", response_model=List[RiderReport])
async def reports_endpoint():
    """Return active non-expired rider reports for pilot debugging/map sync."""

    return list_reports()

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
    
@app.get("/api/search/suggest", response_model=List[SearchSuggestion])
async def search_suggest_endpoint(
    q: str,
    limit: int = 7,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    session_token: Optional[str] = None,
    allow_nominatim: bool = False,
):
    """Google-Maps-style autocomplete.

    Provider order:
    1. Google Places Autocomplete
    2. Local HCMC aliases
    3. Nominatim fallback
    """

    query = (q or "").strip()

    if len(query) < 2:
        return []

    if lat is not None and lng is not None:
        _check_in_vietnam(lat, lng)

    try:
        return await suggest_places(
        query,
        limit=limit,
        lat=lat,
        lng=lng,
        session_token=session_token,
        allow_nominatim=allow_nominatim,
    )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search suggest failed: {e}")


@app.post("/api/search/resolve", response_model=PlaceResolveResponse)
async def search_resolve_endpoint(req: PlaceResolveRequest):
    """Resolve a selected suggestion into final coordinates."""

    try:
        resolved = await resolve_place(
            place_id=req.place_id,
            provider=req.provider,
            title=req.title,
            subtitle=req.subtitle,
            lat=req.lat,
            lng=req.lng,
            session_token=req.session_token,
        )

        _check_in_vietnam(resolved["lat"], resolved["lng"])

        return resolved
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search resolve failed: {e}")


@app.post("/route/safe", response_model=RouteResponse)
async def route_endpoint(req: RouteRequest):
    _check_in_vietnam(req.from_.lat, req.from_.lng)
    _check_in_vietnam(req.to.lat, req.to.lng)

    try:
        return await find_safe_route(
            req.from_,
            req.to,
            req.depart_at_min,
            req.travel_mode,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route failed: {e}")

@app.post("/report/depth", response_model=DepthReportResponse)
async def depth_endpoint(req: DepthReportRequest):
    _check_in_vietnam(req.lat, req.lng)

    try:
        result = await classify_depth(req.image_base64, req.lat, req.lng)

        add_report(
            {
                "lat": req.lat,
                "lng": req.lng,
                "passability": result.passability,
                "confidence": result.confidence,
                "photo_confirmed": True,
                "source": "rider_photo",
            }
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Depth classification failed: {e}")


@app.post("/feedback/wrong-prediction", response_model=WrongPredictionFeedbackResponse)
async def wrong_prediction_feedback_endpoint(req: WrongPredictionFeedbackRequest):
    """Store rider feedback when the prediction did not match road reality."""

    if req.lat is not None and req.lng is not None:
        _check_in_vietnam(req.lat, req.lng)

    payload = add_prediction_feedback(req.model_dump())
    return WrongPredictionFeedbackResponse(
        id=payload["id"],
        created_at=payload["created_at"],
        stored=True,
    )


@app.get("/debug/coverage-point")
async def debug_coverage_point(lat: float, lng: float):
    _check_in_vietnam(lat, lng)
    return resolve_coverage(lat, lng)
