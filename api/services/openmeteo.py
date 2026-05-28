"""Open-Meteo rainfall client with cache.

Why this exists:
- Route scoring calls rainfall several times per route.
- During demo testing, Open-Meteo can return 429 rate-limit errors.
- This cache makes the app stable and allows stale fallback instead of crashing.

Data source:
- Open-Meteo Forecast API
- 15-min precipitation + hourly precipitation/probability
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from config import OPENMETEO_FLOOD_URL, OPENMETEO_URL


CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CACHE_TTL_SECONDS = int(os.getenv("OPENMETEO_CACHE_TTL_SECONDS", "900"))  # 15 min
STALE_TTL_SECONDS = int(os.getenv("OPENMETEO_STALE_TTL_SECONDS", "21600"))  # 6 hr

# Rounding to 2 decimals groups nearby route segments into ~1 km buckets.
# This drastically reduces repeated calls during route scoring.
CACHE_COORD_PRECISION = int(os.getenv("OPENMETEO_CACHE_COORD_PRECISION", "2"))

# Optional transparent demo override.
# Example for filming: export FLOODWATCH_DEMO_RAIN_MM=25
# Leave unset/0 for normal live weather mode.
DEMO_RAIN_MM = float(os.getenv("FLOODWATCH_DEMO_RAIN_MM", "0") or "0")


def _cache_key(url: str, params: Dict[str, Any]) -> Path:
    raw = json.dumps({"url": url, "params": params}, sort_keys=True)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"openmeteo_{digest}.json"


def _read_cache(path: Path, max_age_seconds: int) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None

    age = time.time() - path.stat().st_mtime

    if age > max_age_seconds:
        return None

    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _write_cache(path: Path, data: Dict[str, Any]) -> None:
    tmp = path.with_suffix(".tmp")

    try:
        tmp.write_text(json.dumps(data))
        tmp.replace(path)
    except Exception:
        # Cache must never break the app.
        pass


async def fetch_rainfall(
    lat: float,
    lng: float,
    hours_ahead: int = 6,
) -> Dict[str, Any]:
    """Fetch rainfall forecast for the next `hours_ahead` hours.

    Returns Open-Meteo JSON, usually shaped like:
    {
      "minutely_15": {
        "time": [...],
        "precipitation": [...]
      },
      "hourly": {
        "time": [...],
        "precipitation": [...],
        "precipitation_probability": [...]
      }
    }
    """

    lat_key = round(float(lat), CACHE_COORD_PRECISION)
    lng_key = round(float(lng), CACHE_COORD_PRECISION)

    params = {
        "latitude": lat_key,
        "longitude": lng_key,
        "minutely_15": "precipitation",
        "hourly": "precipitation,precipitation_probability",
        "forecast_days": 2,
        "forecast_hours": max(1, int(hours_ahead)),
        "timezone": "Asia/Ho_Chi_Minh",
    }

    cache_path = _cache_key(OPENMETEO_URL, params)

    cached = _read_cache(cache_path, CACHE_TTL_SECONDS)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(OPENMETEO_URL, params=params)
            response.raise_for_status()
            data = response.json()

        _write_cache(cache_path, data)
        return data

    except Exception:
        # During demo, stale weather is better than a crashed route.
        stale = _read_cache(cache_path, STALE_TTL_SECONDS)

        if stale is not None:
            return stale

        raise


async def fetch_river_discharge(
    lat: float,
    lng: float,
    forecast_days: int = 7,
) -> Dict[str, Any]:
    """Fetch GloFAS river-discharge forecast through Open-Meteo.

    This is a real river forecast signal, not a street-flood observation.
    Open-Meteo selects the largest nearby river within roughly 5 km.
    """

    lat_key = round(float(lat), CACHE_COORD_PRECISION)
    lng_key = round(float(lng), CACHE_COORD_PRECISION)

    params = {
        "latitude": lat_key,
        "longitude": lng_key,
        "daily": (
            "river_discharge,"
            "river_discharge_mean,"
            "river_discharge_p75,"
            "river_discharge_max"
        ),
        "forecast_days": max(1, min(int(forecast_days), 30)),
        "timezone": "Asia/Ho_Chi_Minh",
    }

    cache_path = _cache_key(OPENMETEO_FLOOD_URL, params)

    cached = _read_cache(cache_path, CACHE_TTL_SECONDS)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(OPENMETEO_FLOOD_URL, params=params)
            response.raise_for_status()
            data = response.json()

        _write_cache(cache_path, data)
        return data

    except Exception:
        stale = _read_cache(cache_path, STALE_TTL_SECONDS)

        if stale is not None:
            return stale

        raise


def river_discharge_signal(open_meteo_flood_data: Dict[str, Any]) -> Dict[str, float | str | None]:
    """Convert GloFAS discharge arrays into a conservative route signal."""

    daily = open_meteo_flood_data.get("daily", {}) or {}

    discharge_values = [
        float(value)
        for value in (daily.get("river_discharge", []) or [])[:7]
        if value is not None
    ]
    p75_values = [
        float(value)
        for value in (daily.get("river_discharge_p75", []) or [])[:7]
        if value is not None
    ]
    mean_values = [
        float(value)
        for value in (daily.get("river_discharge_mean", []) or [])[:7]
        if value is not None
    ]

    if not discharge_values:
        return {
            "river_discharge_m3s": None,
            "river_discharge_ratio": None,
            "river_signal": "unavailable",
        }

    peak = max(discharge_values)
    reference_candidates = [*p75_values, *mean_values]
    reference = max(reference_candidates) if reference_candidates else None

    if reference is None or reference <= 0:
        return {
            "river_discharge_m3s": round(peak, 2),
            "river_discharge_ratio": None,
            "river_signal": "available",
        }

    ratio = peak / reference

    if ratio >= 1.6:
        signal = "high"
    elif ratio >= 1.25:
        signal = "moderate"
    else:
        signal = "normal"

    return {
        "river_discharge_m3s": round(peak, 2),
        "river_discharge_ratio": round(ratio, 2),
        "river_signal": signal,
    }


def rainfall_in_window(
    open_meteo_data: Dict[str, Any],
    minutes_from_now: int,
) -> float:
    """Sum rainfall in a roughly 30-min window.

    Uses 15-min buckets. If demo storm mode is enabled, returns at least
    FLOODWATCH_DEMO_RAIN_MM so the team can film a controlled flood scenario.
    """

    bucket = open_meteo_data.get("minutely_15", {})
    rains: List[float] = bucket.get("precipitation", []) or []

    real_rain = 0.0

    if rains:
        idx = max(0, int(minutes_from_now) // 15)
        window = rains[idx : idx + 2]
        real_rain = float(sum(v for v in window if v is not None))

    if DEMO_RAIN_MM > 0:
        return max(real_rain, DEMO_RAIN_MM)

    return real_rain
