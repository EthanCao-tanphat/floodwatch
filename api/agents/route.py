"""Route agent — real road routing + auto-rerouting around floods.

Fetches up to 3 alternative routes from GraphHopper, scores each route
segment-by-segment, picks the safest route, and returns rejected alternatives
for dimmed/dashed display on the frontend map.
"""

import asyncio
import math
import sys
from typing import List, Tuple

from models import (
    AlternativeRoute,
    ConfidenceLevel,
    Coord,
    ForecastPoint,
    Passability,
    RiskEvidence,
    RiskLevel,
    RouteResponse,
    RouteSegment,
)
from agents.forecast import forecast_segment
from services.graphhopper import fetch_road_routes, sample_route_points


Point = Tuple[float, float]  # (lat, lng)


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


def _risk_for_prob(prob: float) -> RiskLevel:
    if prob < 0.25:
        return "low"
    if prob < 0.55:
        return "moderate"
    if prob < 0.80:
        return "high"
    return "severe"


def _passability_for_prob(prob: float) -> Passability:
    if prob < 0.25:
        return "safe"
    if prob < 0.55:
        return "slow_pass"
    if prob < 0.80:
        return "avoid_for_motorbikes"
    return "impassable"


def _confidence_rank(confidence: ConfidenceLevel) -> int:
    return {"low": 0, "medium": 1, "high": 2}.get(confidence, 0)


def _prob_from_point(point: ForecastPoint) -> float:
    return float(point.risk_score if point.risk_score is not None else point.probability)


def _fallback_forecast_point(reason: str) -> ForecastPoint:
    """Low-confidence fallback so the demo does not hard-crash on API/rate-limit errors."""

    print(f"[route] Forecast fallback used: {reason}", file=sys.stderr)

    return ForecastPoint(
        minutes_ahead=60,
        probability=0.35,
        risk_score=0.35,
        rainfall_mm=0.0,
        risk_level="moderate",
        passability="slow_pass",
        confidence="low",
        evidence=RiskEvidence(
            rainfall_mm=0.0,
            tide_level_m=None,
            hotspot_proximity=0.0,
            drainage_score=None,
            report_count=0,
            photo_confirmed=False,
        ),
    )


async def _score_segment_midpoint(start: Point, end: Point) -> ForecastPoint:
    """Score one road segment using the 60-min forecast at its midpoint."""

    mid_lat = (start[0] + end[0]) / 2
    mid_lng = (start[1] + end[1]) / 2

    try:
        forecast = await forecast_segment(mid_lat, mid_lng, horizon_min=90)
    except Exception as exc:
        return _fallback_forecast_point(str(exc))

    if not forecast.points:
        return _fallback_forecast_point("forecast returned no points")

    # Prefer the 60-minute prediction because the product promise is 30-60 min.
    for point in forecast.points:
        if point.minutes_ahead == 60:
            return point

    return forecast.points[-1]


async def _score_route(
    road_points: List[Point],
    n_segments: int = 6,
) -> Tuple[List[RouteSegment], float, Passability, ConfidenceLevel]:
    """Score one route.

    Returns:
        segments, max_flood_prob, overall_passability, overall_confidence
    """

    chunks = sample_route_points(road_points, n_segments=n_segments)

    if not chunks:
        return [], 0.0, "unknown", "low"

    # Score all segments in parallel for speed.
    forecast_points = await asyncio.gather(
        *[_score_segment_midpoint(start, end) for (start, end, _chunk) in chunks]
    )

    segments: List[RouteSegment] = []
    max_prob = 0.0
    best_confidence: ConfidenceLevel = "low"

    for (start, end, chunk), forecast_point in zip(chunks, forecast_points):
        prob = _prob_from_point(forecast_point)
        max_prob = max(max_prob, prob)

        if _confidence_rank(forecast_point.confidence) > _confidence_rank(best_confidence):
            best_confidence = forecast_point.confidence

        segments.append(
            RouteSegment(
                start=Coord(lat=start[0], lng=start[1]),
                end=Coord(lat=end[0], lng=end[1]),
                points=[Coord(lat=p[0], lng=p[1]) for p in chunk],
                flood_prob=round(prob, 3),
                risk_score=round(prob, 3),
                risk_level=forecast_point.risk_level,
                passability=forecast_point.passability,
                confidence=forecast_point.confidence,
                evidence=forecast_point.evidence,
            )
        )

    overall_passability = _passability_for_prob(max_prob)
    return segments, max_prob, overall_passability, best_confidence


def _straight_line_points(from_: Coord, to: Coord, n_points: int = 7) -> List[Point]:
    """Fallback route if GraphHopper fails or API key is missing."""

    out: List[Point] = []

    for i in range(n_points):
        t = i / (n_points - 1)
        out.append(
            (
                from_.lat + (to.lat - from_.lat) * t,
                from_.lng + (to.lng - from_.lng) * t,
            )
        )

    return out


async def find_safe_route(
    from_: Coord,
    to: Coord,
    depart_at_min: int = 0,
) -> RouteResponse:
    """Find the safest route, not necessarily the fastest route."""

    # Try real road routes first.
    roads = await fetch_road_routes(
        from_.lat,
        from_.lng,
        to.lat,
        to.lng,
        max_paths=3,
    )

    # Fallback: straight-line route if GraphHopper is unavailable.
    if not roads:
        road_points = _straight_line_points(from_, to, n_points=7)
        segments, max_prob, overall_passability, confidence = await _score_route(
            road_points,
            n_segments=6,
        )

        distance_km = _haversine_km(from_.lat, from_.lng, to.lat, to.lng)
        eta_min = max(1, int(distance_km / 25 * 60))

        overall_risk = _risk_for_prob(max_prob)

        return RouteResponse(
            distance_km=round(distance_km, 2),
            eta_min=eta_min,
            segments=segments,
            overall_risk=overall_risk,
            overall_passability=overall_passability,
            confidence=confidence,
            recommendation=_recommendation_for(
                overall_risk,
                overall_passability,
                rerouted=False,
            ),
            rerouted=False,
            alternatives=[],
        )

    # Score every GraphHopper alternative route in parallel.
    scored = await asyncio.gather(
        *[_score_route(road["points"], n_segments=6) for road in roads]
    )

    candidates = []

    for idx, (road, score) in enumerate(zip(roads, scored)):
        segments, max_prob, overall_passability, confidence = score

        candidates.append(
            {
                "idx": idx,
                "road": road,
                "segments": segments,
                "max_prob": max_prob,
                "overall_risk": _risk_for_prob(max_prob),
                "overall_passability": overall_passability,
                "confidence": confidence,
            }
        )

    # Choose safest route by max segment risk. Tie-break on GraphHopper fastest.
    chosen = min(candidates, key=lambda c: (c["max_prob"], c["idx"]))
    rerouted = chosen["idx"] != 0

    alternatives: List[AlternativeRoute] = []

    for candidate in candidates:
        if candidate["idx"] == chosen["idx"]:
            continue

        road = candidate["road"]

        alternatives.append(
            AlternativeRoute(
                distance_km=round(road["distance_m"] / 1000.0, 2),
                eta_min=max(1, int(road["time_ms"] / 60000.0)),
                overall_risk=candidate["overall_risk"],
                flood_prob_max=round(candidate["max_prob"], 3),
                points=[Coord(lat=p[0], lng=p[1]) for p in road["points"]],
                is_fastest=(candidate["idx"] == 0),
            )
        )

    chosen_road = chosen["road"]

    return RouteResponse(
        distance_km=round(chosen_road["distance_m"] / 1000.0, 2),
        eta_min=max(1, int(chosen_road["time_ms"] / 60000.0)),
        segments=chosen["segments"],
        overall_risk=chosen["overall_risk"],
        overall_passability=chosen["overall_passability"],
        confidence=chosen["confidence"],
        recommendation=_recommendation_for(
            chosen["overall_risk"],
            chosen["overall_passability"],
            rerouted=rerouted,
        ),
        rerouted=rerouted,
        alternatives=alternatives,
    )


def _recommendation_for(
    overall_risk: RiskLevel,
    overall_passability: Passability,
    rerouted: bool,
) -> str:
    """Human-readable route recommendation."""

    prefix = ""

    if rerouted:
        prefix = "Rerouted around a higher-risk flood path. "

    if overall_passability == "impassable" or overall_risk == "severe":
        return prefix + "Strongly recommend delaying. Flooding may be unsafe for motorbikes."

    if overall_passability == "avoid_for_motorbikes" or overall_risk == "high":
        return prefix + "Avoid this route if possible. Some segments may stall motorbikes."

    if overall_passability == "slow_pass" or overall_risk == "moderate":
        return prefix + "Mostly passable, but slow down near highlighted wet segments."

    if overall_passability == "unknown":
        return prefix + "Insufficient evidence. Proceed carefully and check rider reports."

    return prefix + "Route looks safe for normal motorbike travel in the next 30-60 minutes."
