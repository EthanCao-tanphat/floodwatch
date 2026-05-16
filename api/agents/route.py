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
    CoverageInfo,
    ForecastPoint,
    Passability,
    RiskEvidence,
    RiskLevel,
    RouteCandidate,
    RouteResponse,
    RouteSegment,
)
from agents.forecast import forecast_segment
from services.graphhopper import fetch_road_routes, sample_route_points
from services.coverage_tiers import coverage_for_route
from services.reports import report_evidence_for_segment


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




def _evidence_with_report_signal(
    evidence: RiskEvidence,
    report_summary: dict,
) -> RiskEvidence:
    payload = (
        evidence.model_dump()
        if hasattr(evidence, "model_dump")
        else evidence.dict()
    )

    payload["report_count"] = int(report_summary.get("report_count", 0))
    payload["photo_confirmed"] = bool(report_summary.get("photo_confirmed", False))

    return RiskEvidence(**payload)

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
        report_summary = report_evidence_for_segment(start, end)
        evidence = _evidence_with_report_signal(forecast_point.evidence, report_summary)

        # Rider reports increase risk only when they are close to this route segment.
        prob = min(
            1.0,
            max(
                0.0,
                _prob_from_point(forecast_point)
                + float(report_summary.get("risk_bonus", 0.0)),
            ),
        )

        risk_level = _risk_for_prob(prob)
        passability = _passability_for_prob(prob)

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
                risk_level=risk_level,
                passability=passability,
                confidence=forecast_point.confidence,
                evidence=evidence,
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




def _coverage_info_for(points: List[Point]) -> CoverageInfo:
    return CoverageInfo(**coverage_for_route(points))


def _route_label(idx: int, recommended_idx: int, safest_idx: int) -> str:
    if idx == recommended_idx:
        return "Recommended"
    if idx == 0:
        return "Fastest"
    if idx == safest_idx:
        return "Safest"
    return f"Alternative {idx + 1}"


def _tradeoff_summary(
    idx: int,
    max_prob: float,
    fastest_eta_min: int,
    eta_min: int,
    recommended_idx: int,
) -> str:
    risk_pct = round(max_prob * 100)

    if idx == recommended_idx and idx != 0:
        extra = max(0, eta_min - fastest_eta_min)
        return f"+{extra} min, avoids a higher-risk flood path"

    if idx == 0 and idx != recommended_idx:
        return f"Fastest, but reaches {risk_pct}% flood risk"

    if max_prob < 0.25:
        return "Lowest flood exposure"

    if max_prob < 0.55:
        return "Moderate flood exposure"

    if max_prob < 0.80:
        return "High-risk segment included"

    return "Severe flood exposure"


def _route_candidate_for(
    idx: int,
    road: dict,
    segments: List[RouteSegment],
    max_prob: float,
    overall_passability: Passability,
    confidence: ConfidenceLevel,
    recommended_idx: int,
    safest_idx: int,
    fastest_eta_min: int,
) -> RouteCandidate:
    eta_min = max(1, int(road["time_ms"] / 60000.0))
    risk = _risk_for_prob(max_prob)

    return RouteCandidate(
        id=f"route_{idx}",
        label=_route_label(idx, recommended_idx, safest_idx),
        distance_km=round(road["distance_m"] / 1000.0, 2),
        eta_min=eta_min,
        points=[Coord(lat=p[0], lng=p[1]) for p in road["points"]],
        segments=segments,
        overall_risk=risk,
        overall_passability=overall_passability,
        confidence=confidence,
        recommendation=_recommendation_for(
            risk,
            overall_passability,
            rerouted=(idx != 0),
        ),
        flood_prob_max=round(max_prob, 3),
        is_recommended=(idx == recommended_idx),
        is_fastest=(idx == 0),
        is_safest=(idx == safest_idx),
        tradeoff_summary=_tradeoff_summary(
            idx,
            max_prob,
            fastest_eta_min,
            eta_min,
            recommended_idx,
        ),
    )


async def find_safe_route(
    from_: Coord,
    to: Coord,
    depart_at_min: int = 0,
) -> RouteResponse:
    """Find safest/recommended route and return all selectable candidates."""

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

        fallback_road = {
            "points": road_points,
            "distance_m": distance_km * 1000,
            "time_ms": eta_min * 60000,
        }

        candidate = _route_candidate_for(
            idx=0,
            road=fallback_road,
            segments=segments,
            max_prob=max_prob,
            overall_passability=overall_passability,
            confidence=confidence,
            recommended_idx=0,
            safest_idx=0,
            fastest_eta_min=eta_min,
        )

        return RouteResponse(
            distance_km=round(distance_km, 2),
            eta_min=eta_min,
            segments=segments,
            overall_risk=overall_risk,
            overall_passability=overall_passability,
            confidence=confidence,
            recommendation=candidate.recommendation,
            rerouted=False,
            alternatives=[],
            routes=[candidate],
            selected_route_id=candidate.id,
            recommended_route_id=candidate.id,
            fastest_route_id=candidate.id,
            safest_route_id=candidate.id,
            coverage=_coverage_info_for(road_points),
        )

    scored = await asyncio.gather(
        *[_score_route(road["points"], n_segments=6) for road in roads]
    )

    candidates_raw = []

    for idx, (road, score) in enumerate(zip(roads, scored)):
        segments, max_prob, overall_passability, confidence = score

        candidates_raw.append(
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

    # GraphHopper index 0 is fastest. Safest is lowest max flood probability.
    safest = min(candidates_raw, key=lambda c: (c["max_prob"], c["idx"]))
    safest_idx = int(safest["idx"])

    # Recommended currently equals safest. This keeps FloodWatch's promise:
    # not only fastest, but safest for motorbike passability.
    recommended_idx = safest_idx
    recommended_raw = candidates_raw[recommended_idx]

    fastest_eta_min = max(1, int(candidates_raw[0]["road"]["time_ms"] / 60000.0))

    route_candidates: List[RouteCandidate] = []

    for candidate in candidates_raw:
        route_candidates.append(
            _route_candidate_for(
                idx=int(candidate["idx"]),
                road=candidate["road"],
                segments=candidate["segments"],
                max_prob=float(candidate["max_prob"]),
                overall_passability=candidate["overall_passability"],
                confidence=candidate["confidence"],
                recommended_idx=recommended_idx,
                safest_idx=safest_idx,
                fastest_eta_min=fastest_eta_min,
            )
        )

    selected = route_candidates[recommended_idx]
    rerouted = recommended_idx != 0

    alternatives: List[AlternativeRoute] = []

    for candidate in route_candidates:
        if candidate.id == selected.id:
            continue

        alternatives.append(
            AlternativeRoute(
                distance_km=candidate.distance_km,
                eta_min=candidate.eta_min,
                overall_risk=candidate.overall_risk,
                flood_prob_max=candidate.flood_prob_max,
                points=candidate.points,
                is_fastest=candidate.is_fastest,
                route_id=candidate.id,
            )
        )

    fastest_id = route_candidates[0].id
    safest_id = route_candidates[safest_idx].id
    recommended_id = selected.id

    return RouteResponse(
        distance_km=selected.distance_km,
        eta_min=selected.eta_min,
        segments=selected.segments,
        overall_risk=selected.overall_risk,
        overall_passability=selected.overall_passability,
        confidence=selected.confidence,
        recommendation=selected.recommendation,
        rerouted=rerouted,
        alternatives=alternatives,
        routes=route_candidates,
        selected_route_id=selected.id,
        recommended_route_id=recommended_id,
        fastest_route_id=fastest_id,
        safest_route_id=safest_id,
        coverage=_coverage_info_for([(p.lat, p.lng) for p in selected.points]),
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
