"""Vietnam-wide coverage tier logic for FloodWatch.

FloodWatch can route across Vietnam, but prediction confidence depends on
local evidence availability.

Tier 1: Full pilot prediction.
Tier 2: Partial prediction in major flood-relevant cities.
Tier 3: Rain-only warning anywhere else in Vietnam.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, Tuple


Point = Tuple[float, float]  # lat, lng


TIER1_CITIES = [
    {
        "id": "hcmc",
        "name": "Ho Chi Minh City",
        "center": (10.7769, 106.7009),
        "radius_km": 55,
    },
]

TIER2_CITIES = [
    {
        "id": "hanoi",
        "name": "Hanoi",
        "center": (21.0278, 105.8342),
        "radius_km": 45,
    },
    {
        "id": "danang",
        "name": "Da Nang",
        "center": (16.0471, 108.2068),
        "radius_km": 35,
    },
    {
        "id": "cantho",
        "name": "Can Tho",
        "center": (10.0452, 105.7469),
        "radius_km": 35,
    },
    {
        "id": "hue",
        "name": "Hue",
        "center": (16.4637, 107.5909),
        "radius_km": 30,
    },
    {
        "id": "nhatrang",
        "name": "Nha Trang",
        "center": (12.2388, 109.1967),
        "radius_km": 30,
    },
    {
        "id": "haiphong",
        "name": "Hai Phong",
        "center": (20.8449, 106.6881),
        "radius_km": 35,
    },
    {
        "id": "vungtau",
        "name": "Vung Tau",
        "center": (10.3460, 107.0843),
        "radius_km": 35,
    },
    {
        "id": "bienhoa",
        "name": "Bien Hoa",
        "center": (10.9574, 106.8427),
        "radius_km": 35,
    },
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0

    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    )

    return 2 * radius_km * math.asin(math.sqrt(a))


def _near_city(points: Iterable[Point], cities: list[Dict[str, Any]]) -> Dict[str, Any] | None:
    pts = list(points)

    for city in cities:
        c_lat, c_lng = city["center"]

        for lat, lng in pts:
            if _haversine_km(lat, lng, c_lat, c_lng) <= city["radius_km"]:
                return city

    return None


def coverage_for_route(points: list[Point]) -> Dict[str, Any]:
    """Return prediction coverage tier for a route."""

    if not points:
        return {
            "tier": 3,
            "label": "Rain-only warning",
            "city": "Vietnam",
            "signals": {
                "rainfall": True,
                "tide": False,
                "hotspots": False,
                "drainage": False,
                "rider_reports": True,
            },
            "confidence_note": "Vietnam-wide fallback: rainfall forecast and rider reports only.",
        }

    # Use endpoints + midpoint. This is enough for coverage labeling.
    selected_points = [points[0], points[-1]]

    if len(points) > 2:
        selected_points.append(points[len(points) // 2])

    tier1 = _near_city(selected_points, TIER1_CITIES)

    if tier1:
        return {
            "tier": 1,
            "label": "Full prediction",
            "city": tier1["name"],
            "signals": {
                "rainfall": True,
                "tide": True,
                "hotspots": True,
                "drainage": True,
                "rider_reports": True,
            },
            "confidence_note": "Full HCMC pilot coverage: rain, tide pressure, hotspots, drainage proxy, and rider reports.",
        }

    tier2 = _near_city(selected_points, TIER2_CITIES)

    if tier2:
        return {
            "tier": 2,
            "label": "Partial prediction",
            "city": tier2["name"],
            "signals": {
                "rainfall": True,
                "tide": True,
                "hotspots": False,
                "drainage": False,
                "rider_reports": True,
            },
            "confidence_note": "Partial coverage: rainfall, coastal/tide pressure where relevant, and rider reports. Local hotspot/drainage data is limited.",
        }

    return {
        "tier": 3,
        "label": "Rain-only warning",
        "city": "Vietnam",
        "signals": {
            "rainfall": True,
            "tide": False,
            "hotspots": False,
            "drainage": False,
            "rider_reports": True,
        },
        "confidence_note": "Lower confidence outside pilot areas: rainfall-first warning plus rider reports.",
    }
