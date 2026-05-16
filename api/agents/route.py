"""Route agent — real road routing via GraphHopper.

If GRAPHHOPPER_API_KEY is set, uses real road paths and each segment carries
its own polyline points so the frontend can draw the actual road geometry.
If not, falls back to straight-line segment sampling so the demo still works.
"""
import math
from typing import List
from models import Coord, RouteSegment, RouteResponse
from agents.forecast import forecast_segment
from services.graphhopper import fetch_road_route, sample_route_points


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def find_safe_route(
    from_: Coord, to: Coord, depart_at_min: int = 0
) -> RouteResponse:
    # Try to get a real road route first
    road = await fetch_road_route(from_.lat, from_.lng, to.lat, to.lng)

    if road and road["points"]:
        # Real road route — sample into segments with full geometry per segment
        segment_chunks = sample_route_points(road["points"], n_segments=6)
        distance_km = road["distance_m"] / 1000.0
        eta_min = max(1, int(road["time_ms"] / 60000.0))
    else:
        # Fallback: straight-line sampling
        N = 5
        segment_chunks = []
        for i in range(N):
            t0 = i / N
            t1 = (i + 1) / N
            a = (from_.lat + (to.lat - from_.lat) * t0, from_.lng + (to.lng - from_.lng) * t0)
            b = (from_.lat + (to.lat - from_.lat) * t1, from_.lng + (to.lng - from_.lng) * t1)
            segment_chunks.append((a, b, [a, b]))
        distance_km = _haversine_km(from_.lat, from_.lng, to.lat, to.lng)
        eta_min = max(1, int(distance_km / 25 * 60))

    # Score each segment via the forecast agent at its midpoint
    segments: List[RouteSegment] = []
    max_prob = 0.0
    for (start, end, chunk) in segment_chunks:
        mid_lat = (start[0] + end[0]) / 2
        mid_lng = (start[1] + end[1]) / 2
        forecast = await forecast_segment(mid_lat, mid_lng, horizon_min=60)
        # Use 60-min forecast as canonical for the MVP passability decision.
        point = next((p for p in forecast.points if p.minutes_ahead == 60), forecast.points[0])
        prob = point.probability
        risk = point.risk_level
        max_prob = max(max_prob, prob)
        segments.append(
            RouteSegment(
                start=Coord(lat=start[0], lng=start[1]),
                end=Coord(lat=end[0], lng=end[1]),
                points=[Coord(lat=p[0], lng=p[1]) for p in chunk],
                flood_prob=round(prob, 3),
                risk_score=round(prob, 3),
                risk_level=risk,
                passability=point.passability,
                confidence=point.confidence,
                evidence=point.evidence,
            )
        )

    # Pick overall risk + recommendation
    if max_prob > 0.75:
        overall, passability, confidence, rec = (
            "severe",
            "impassable",
            "high",
            "Strongly recommend delaying or finding an alternate route. At least one segment is likely unsafe for motorbikes.",
        )
    elif max_prob > 0.5:
        overall, passability, confidence, rec = (
            "high",
            "avoid_for_motorbikes",
            "medium",
            "Route has flood-prone segments. Avoid the highlighted roads if a safer route is available.",
        )
    elif max_prob > 0.25:
        overall, passability, confidence, rec = (
            "moderate",
            "slow_pass",
            "medium",
            "Mostly passable, but slow down near highlighted segments and watch for fresh reports.",
        )
    else:
        overall, passability, confidence, rec = (
            "low",
            "safe",
            "low",
            "Route looks passable for motorbikes in the next 30-60 minutes.",
        )

    return RouteResponse(
        distance_km=round(distance_km, 2),
        eta_min=eta_min,
        segments=segments,
        overall_risk=overall,
        overall_passability=passability,
        confidence=confidence,
        recommendation=rec,
    )
