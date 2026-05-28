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
import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import httpx

from config import METNO_LOCATIONFORECAST_URL, OPENMETEO_FLOOD_URL, OPENMETEO_URL


CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CACHE_TTL_SECONDS = int(os.getenv("OPENMETEO_CACHE_TTL_SECONDS", "900"))  # 15 min
STALE_TTL_SECONDS = int(os.getenv("OPENMETEO_STALE_TTL_SECONDS", "21600"))  # 6 hr

# Rounding to 1 decimal groups nearby route segments into ~10 km buckets.
# This drastically reduces repeated calls during route scoring.
CACHE_COORD_PRECISION = int(os.getenv("OPENMETEO_CACHE_COORD_PRECISION", "1"))
REQUEST_MIN_INTERVAL_SECONDS = float(os.getenv("OPENMETEO_MIN_INTERVAL_SECONDS", "1.2"))
METNO_USER_AGENT = os.getenv(
    "METNO_USER_AGENT",
    "FloodWatch/0.2 https://github.com/EthanCao-tanphat/floodwatch",
)

# Optional transparent demo override.
# Example for filming: export FLOODWATCH_DEMO_RAIN_MM=25
# Leave unset/0 for normal live weather mode.
DEMO_RAIN_MM = float(os.getenv("FLOODWATCH_DEMO_RAIN_MM", "0") or "0")

_REQUEST_LOCK = asyncio.Lock()
_LAST_REQUEST_AT = 0.0
_IN_FLIGHT: dict[str, asyncio.Task[Dict[str, Any]]] = {}


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


async def _throttled_get_json(
    url: str,
    params: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Call Open-Meteo gently so production does not burn through rate limits."""

    global _LAST_REQUEST_AT

    async with _REQUEST_LOCK:
        elapsed = time.monotonic() - _LAST_REQUEST_AT
        wait_for = REQUEST_MIN_INTERVAL_SECONDS - elapsed

        if wait_for > 0:
            await asyncio.sleep(wait_for)

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params=params, headers=headers)
            _LAST_REQUEST_AT = time.monotonic()

        if response.status_code == 429:
            retry_after = response.headers.get("retry-after")
            try:
                pause_for = min(float(retry_after or "2"), 8.0)
            except ValueError:
                pause_for = 2.0

            await asyncio.sleep(pause_for)

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, params=params, headers=headers)
                _LAST_REQUEST_AT = time.monotonic()

        response.raise_for_status()
        return response.json()


async def _cached_weather_json(
    url: str,
    params: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    cache_path = _cache_key(url, params)

    cached = _read_cache(cache_path, CACHE_TTL_SECONDS)
    if cached is not None:
        return cached

    key = str(cache_path)
    existing = _IN_FLIGHT.get(key)

    if existing is not None:
        return await existing

    async def load() -> Dict[str, Any]:
        try:
            data = await _throttled_get_json(url, params, headers=headers)
            _write_cache(cache_path, data)
            return data
        except Exception:
            stale = _read_cache(cache_path, STALE_TTL_SECONDS)

            if stale is not None:
                return stale

            raise

    task = asyncio.create_task(load())
    _IN_FLIGHT[key] = task

    try:
        return await task
    finally:
        _IN_FLIGHT.pop(key, None)


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

    try:
        return await _cached_weather_json(OPENMETEO_URL, params)
    except Exception:
        return await fetch_metno_rainfall(lat_key, lng_key, hours_ahead=hours_ahead)


async def fetch_metno_rainfall(
    lat: float,
    lng: float,
    hours_ahead: int = 6,
) -> Dict[str, Any]:
    """Fetch a no-key global precipitation forecast from MET Norway."""

    params = {
        "lat": round(float(lat), CACHE_COORD_PRECISION),
        "lon": round(float(lng), CACHE_COORD_PRECISION),
    }

    data = await _cached_weather_json(
        METNO_LOCATIONFORECAST_URL,
        params,
        headers={"User-Agent": METNO_USER_AGENT},
    )

    timeseries = ((data.get("properties") or {}).get("timeseries") or [])[: max(1, hours_ahead)]
    hourly_precip: List[float] = []
    hourly_probability: List[int] = []
    minutely_15: List[float] = []

    for item in timeseries:
        next_hour = ((item.get("data") or {}).get("next_1_hours") or {})
        details = next_hour.get("details") or {}
        precip = float(details.get("precipitation_amount") or 0.0)
        probability = int(round(float(details.get("probability_of_precipitation") or 0)))

        hourly_precip.append(precip)
        hourly_probability.append(probability)
        minutely_15.extend([precip / 4.0] * 4)

    return {
        "source": "MET Norway Locationforecast",
        "minutely_15": {"precipitation": minutely_15},
        "hourly": {
            "precipitation": hourly_precip,
            "precipitation_probability": hourly_probability,
        },
    }


async def fetch_rainfall_many(
    points: Sequence[tuple[float, float]],
    hours_ahead: int = 6,
) -> List[Dict[str, Any]]:
    """Fetch rainfall forecasts for several locations in one Open-Meteo call."""

    if not points:
        return []

    rounded = [
        (
            round(float(lat), CACHE_COORD_PRECISION),
            round(float(lng), CACHE_COORD_PRECISION),
        )
        for lat, lng in points
    ]

    if len(rounded) == 1:
        lat, lng = rounded[0]
        return [await fetch_rainfall(lat, lng, hours_ahead=hours_ahead)]

    params = {
        "latitude": ",".join(str(lat) for lat, _lng in rounded),
        "longitude": ",".join(str(lng) for _lat, lng in rounded),
        "minutely_15": "precipitation",
        "hourly": "precipitation,precipitation_probability",
        "forecast_days": 2,
        "forecast_hours": max(1, int(hours_ahead)),
        "timezone": "Asia/Ho_Chi_Minh",
    }

    try:
        data = await _cached_weather_json(OPENMETEO_URL, params)
    except Exception:
        return [
            await fetch_metno_rainfall(lat, lng, hours_ahead=hours_ahead)
            for lat, lng in rounded
        ]

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    if isinstance(data, dict):
        return [data]

    return []


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

    return await _cached_weather_json(OPENMETEO_FLOOD_URL, params)


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
