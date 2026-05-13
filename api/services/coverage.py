"""Resolve any (lat, lng) in Vietnam to its tier and pilot city.

Tier 1: HCMC — full multi-feature fusion
Tier 2: Hanoi, Da Nang, Can Tho, Hue — rainfall + tide
Tier 3: anywhere else in Vietnam — rainfall only
"""
import math
from typing import Optional, TypedDict
from config import PILOT_CITIES


class CoverageInfo(TypedDict):
    tier: int
    city_id: Optional[str]
    city_name_vi: Optional[str]
    city_name_en: Optional[str]
    coastal: bool
    tide_station: Optional[str]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def resolve_coverage(lat: float, lng: float) -> CoverageInfo:
    """Find which pilot city this coord falls in (if any) and return the tier."""
    best: Optional[str] = None
    best_dist = float("inf")
    for city_id, meta in PILOT_CITIES.items():
        clat, clng = meta["center"]
        d = _haversine_km(lat, lng, clat, clng)
        if d <= meta["radius_km"] and d < best_dist:
            best = city_id
            best_dist = d

    if best is None:
        # Outside any pilot city — Tier 3 (rainfall-only)
        return CoverageInfo(
            tier=3,
            city_id=None,
            city_name_vi=None,
            city_name_en=None,
            coastal=False,
            tide_station=None,
        )

    meta = PILOT_CITIES[best]
    return CoverageInfo(
        tier=meta["tier"],
        city_id=best,
        city_name_vi=meta["name_vi"],
        city_name_en=meta["name_en"],
        coastal=meta["coastal"],
        tide_station=meta["tide_station"],
    )
