"""Tide / sea-level signal for FloodWatch.

Old version:
- Synthetic sine wave.

This version:
- Uses Open-Meteo Marine current sea_level_height_msl near Vung Tau.
- Caches the value.
- Falls back safely if the marine API is unavailable.

Important:
Open-Meteo's sea_level_height_msl is above global mean sea level, not a local
Vietnam chart datum. For routing risk, we convert it into a "tide pressure"
meters-equivalent value so the existing flood model thresholds remain usable.

This is better than fake tide, but still not a perfect official station feed.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import httpx


VN_TZ = timezone(timedelta(hours=7))

CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CACHE_TTL_SECONDS = int(os.getenv("TIDE_CACHE_TTL_SECONDS", "1800"))  # 30 min
STALE_TTL_SECONDS = int(os.getenv("TIDE_STALE_TTL_SECONDS", "21600"))  # 6 hr

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

# Vung Tau coastal reference point.
VUNG_TAU_LAT = float(os.getenv("VUNG_TAU_TIDE_LAT", "10.3460"))
VUNG_TAU_LNG = float(os.getenv("VUNG_TAU_TIDE_LNG", "107.0843"))


def _cache_key(params: Dict[str, Any]) -> Path:
    raw = json.dumps({"url": MARINE_URL, "params": params}, sort_keys=True)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"tide_{digest}.json"


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
        pass


def _synthetic_fallback(when: datetime | None = None) -> float:
    """Old sine fallback, only used when real/modeled marine data fails."""

    if when is None:
        when = datetime.now(VN_TZ)

    h = when.hour + when.minute / 60.0
    phase = (h / 24.0) * 4 * math.pi
    tide = 1.0 + 0.6 * math.sin(phase - math.pi / 2)

    return round(tide, 2)


def _extract_raw_sea_level(data: Dict[str, Any]) -> Optional[float]:
    current = data.get("current") or {}

    if current.get("sea_level_height_msl") is not None:
        return float(current["sea_level_height_msl"])

    hourly = data.get("hourly") or {}
    values = hourly.get("sea_level_height_msl") or []

    for value in values:
        if value is not None:
            return float(value)

    return None


def _normalize_to_tide_pressure(raw_sea_level_msl: float) -> float:
    """Convert modeled sea-level anomaly into HCMC drainage-pressure signal.

    Open-Meteo sea_level_height_msl is not local chart-datum tide height.
    The existing FloodWatch model expects approximately:
    - <= 1.2m: low tide pressure
    - 1.3m-1.6m: drainage/tide interaction matters
    - >= 1.6m: strong tide pressure

    So we use the real modeled sea-level movement as the signal, then shift it
    into the model's existing risk scale.
    """

    pressure = 1.25 + raw_sea_level_msl
    pressure = max(0.4, min(1.9, pressure))

    return round(pressure, 2)


def get_tide_level(when: datetime | None = None) -> float:
    """Return Vung Tau modeled tide-pressure level in meters-equivalent."""

    # For historical/unit-test calls, keep deterministic fallback behavior.
    # Normal app calls pass None.
    if when is not None:
        return _synthetic_fallback(when)

    params = {
        "latitude": VUNG_TAU_LAT,
        "longitude": VUNG_TAU_LNG,
        "current": "sea_level_height_msl",
        "hourly": "sea_level_height_msl",
        "forecast_hours": 1,
        "timezone": "Asia/Ho_Chi_Minh",
        "cell_selection": "sea",
    }

    cache_path = _cache_key(params)

    cached = _read_cache(cache_path, CACHE_TTL_SECONDS)

    if cached is not None:
        raw = _extract_raw_sea_level(cached)

        if raw is not None:
            return _normalize_to_tide_pressure(raw)

    try:
        with httpx.Client(timeout=10) as client:
            response = client.get(MARINE_URL, params=params)
            response.raise_for_status()
            data = response.json()

        _write_cache(cache_path, data)

        raw = _extract_raw_sea_level(data)

        if raw is not None:
            return _normalize_to_tide_pressure(raw)

    except Exception:
        stale = _read_cache(cache_path, STALE_TTL_SECONDS)

        if stale is not None:
            raw = _extract_raw_sea_level(stale)

            if raw is not None:
                return _normalize_to_tide_pressure(raw)

    return _synthetic_fallback()


def tide_factor(level_m: float) -> float:
    """Normalized 0..1 contribution to flood risk.

    Below 1.2m: negligible.
    Above 1.6m: dominant.
    Smooth ramp in between.
    """

    if level_m <= 1.2:
        return 0.0

    if level_m >= 1.6:
        return 1.0

    return (level_m - 1.2) / 0.4
