"""In-memory rider report store for the FloodWatch demo.

This makes rider photo reports visible on the map and lets recent reports
influence nearby route segment evidence.

For finals, replace this with a database.
"""

from __future__ import annotations

import math
import time
import uuid
from typing import Any, Dict, List, Tuple


REPORTS: List[Dict[str, Any]] = []

SEVERITY_BONUS = {
    "safe": 0.00,
    "slow_pass": 0.08,
    "avoid_for_motorbikes": 0.16,
    "impassable": 0.25,
    "unknown": 0.00,
}


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


def add_report(report: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        "id": str(uuid.uuid4())[:8],
        "created_at": int(time.time()),
        "lat": float(report["lat"]),
        "lng": float(report["lng"]),
        "passability": report.get("passability", "unknown"),
        "confidence": float(report.get("confidence", 0.5)),
        "photo_confirmed": True,
        "source": "rider_photo",
    }

    REPORTS.append(payload)

    # Keep latest 80 reports for demo stability.
    REPORTS[:] = REPORTS[-80:]

    return payload


def list_reports() -> List[Dict[str, Any]]:
    return list(REPORTS)


def count_reports() -> int:
    return len(REPORTS)


def report_evidence_for_segment(
    start: Tuple[float, float],
    end: Tuple[float, float],
    radius_km: float = 0.65,
) -> Dict[str, Any]:
    """Return report evidence near a segment midpoint.

    start/end are (lat, lng).
    """

    mid_lat = (start[0] + end[0]) / 2
    mid_lng = (start[1] + end[1]) / 2

    nearby = []

    for report in REPORTS:
        d = _haversine_km(mid_lat, mid_lng, report["lat"], report["lng"])

        if d <= radius_km:
            nearby.append(report)

    if not nearby:
        return {
            "report_count": 0,
            "photo_confirmed": False,
            "risk_bonus": 0.0,
        }

    risk_bearing = [
        r
        for r in nearby
        if SEVERITY_BONUS.get(r.get("passability", "unknown"), 0.0) > 0
    ]

    if not risk_bearing:
        return {
            "report_count": len(nearby),
            "photo_confirmed": True,
            "risk_bonus": 0.0,
        }

    max_bonus = max(SEVERITY_BONUS.get(r.get("passability", "unknown"), 0.0) for r in risk_bearing)
    count_bonus = min(0.12, len(risk_bearing) * 0.03)

    return {
        "report_count": len(nearby),
        "photo_confirmed": True,
        "risk_bonus": min(0.35, max_bonus + count_bonus),
    }
