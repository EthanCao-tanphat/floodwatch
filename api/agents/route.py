"""Route agent — real road routing + auto-rerouting around floods.

Fetches up to 3 alternative routes from GraphHopper, scores each one's
flood risk, picks the SAFEST (not necessarily fastest), and returns the
others as `alternatives` so the frontend can dim them in red.

If the chosen safe route is not the fastest one, `rerouted=true` and the
recommendation message tells the user we rerouted them around flooding.
"""
import asyncio
import math
from typing import List, Tuple
from models import Coord, RouteSegment, RouteResponse, AlternativeRoute
from agents.forecast import forecast_segment
from services.graphhopper import fetch_road_routes, sample_route_points


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _risk_for_prob(p: float) -> str:
    if p > 0.75:
        return "severe"
    if p > 0.5:
        return "high"
    if p > 0.25:
        return "moderate"
    return "low"


async def _score_segment_midpoint(start: Tuple[float, float], end: Tuple[float, float]) -> Tuple[float, str]:
    """Score a single segment via the 60-min forecast at its midpoint."""
    mid_lat = (start[0] + end[0]) / 2
    mid_lng = (start[1] + end[1]) / 2
    forecast = await forecast_segment(mid_lat, mid_lng, horizon_min=90)
    prob = next(
        (p.probability for p in forecast.points if p.minutes_ahead == 60),
        forecast.points[0].probability if forecast.points else 0.0,
    )
    risk = next(
        (p.risk_level for p in forecast.points if p.minutes_ahead == 60),
        "low",
    )
    return prob, risk


async def _score_route(
    road_points: List[Tuple[float, float]], n_segments: int = 6
) -> Tuple[List[RouteSegment], float]:
    """Score one route. Returns (segments, max_flood_prob)."""
    chunks = sample_route_points(road_points, n_segments=n_segments)

    # Score all segments in parallel — big speedup vs sequential.
    scores = await asyncio.gather(
        *[_score_segment_midpoint(s, e) for (s, e, _) in chunks]
    )

    segments: List[RouteSegment] = []
    max_prob = 0.0
    for (start, end, chunk), (prob, risk) in zip(chunks, scores):
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
    return segments, max_prob


async def find_safe_route(
    from_: Coord, to: Coord, depart_at_min: int = 0
) -> RouteResponse:
    # Try to get multiple alternative routes from GraphHopper
    roads = await fetch_road_routes(
        from_.lat, from_.lng, to.lat, to.lng, max_paths=3
    )

    # --- Fallback: no GraphHopper. Single straight-line route. ---
    if not roads:
        N = 5
        chunks = []
        for i in range(N):
            t0 = i / N
            t1 = (i + 1) / N
            a = (from_.lat + (to.lat - from_.lat) * t0, from_.lng + (to.lng - from_.lng) * t0)
            b = (from_.lat + (to.lat - from_.lat) * t1, from_.lng + (to.lng - from_.lng) * t1)
            chunks.append((a, b, [a, b]))

        scores = await asyncio.gather(
            *[_score_segment_midpoint(s, e) for (s, e, _) in chunks]
        )
        segments: List[RouteSegment] = []
        max_prob = 0.0
        for (start, end, chunk), (prob, risk) in zip(chunks, scores):
            max_prob = max(max_prob, prob)
            segments.append(
                RouteSegment(
                    start=Coord(lat=start[0], lng=start[1]),
                    end=Coord(lat=end[0], lng=end[1]),
                    points=[Coord(lat=p[0], lng=p[1]) for p in chunk],
                    flood_prob=round(prob, 3),
                    risk_level=risk,
                )
            )
        distance_km = _haversine_km(from_.lat, from_.lng, to.lat, to.lng)
        eta_min = max(1, int(distance_km / 25 * 60))
        overall = _risk_for_prob(max_prob)
        rec = _recommendation_for(overall, rerouted=False)
        return RouteResponse(
            distance_km=round(distance_km, 2),
            eta_min=eta_min,
            segments=segments,
            overall_risk=overall,
            recommendation=rec,
            rerouted=False,
            alternatives=[],
        )

    # --- Score every alternative route in parallel ---
    scored = await asyncio.gather(
        *[_score_route(road["points"], n_segments=6) for road in roads]
    )

    # Pair each scored route with its road metadata
    candidates = []
    for idx, (road, (segments, max_prob)) in enumerate(zip(roads, scored)):
        candidates.append({
            "idx": idx,                 # 0 = fastest from GraphHopper
            "road": road,
            "segments": segments,
            "max_prob": max_prob,
            "overall_risk": _risk_for_prob(max_prob),
        })

    # --- Pick safest: lowest max_prob, tie-break on fastest (lower idx) ---
    chosen = min(candidates, key=lambda c: (c["max_prob"], c["idx"]))
    rerouted = chosen["idx"] != 0  # we picked a non-fastest path for safety

    # Build the alternatives list (everything we didn't pick)
    alternatives: List[AlternativeRoute] = []
    for c in candidates:
        if c["idx"] == chosen["idx"]:
            continue
        alternatives.append(
            AlternativeRoute(
                distance_km=round(c["road"]["distance_m"] / 1000.0, 2),
                eta_min=max(1, int(c["road"]["time_ms"] / 60000.0)),
                overall_risk=c["overall_risk"],
                flood_prob_max=round(c["max_prob"], 3),
                points=[Coord(lat=p[0], lng=p[1]) for p in c["road"]["points"]],
                is_fastest=(c["idx"] == 0),
            )
        )

    chosen_road = chosen["road"]
    chosen_overall = chosen["overall_risk"]
    rec = _recommendation_for(chosen_overall, rerouted=rerouted)

    return RouteResponse(
        distance_km=round(chosen_road["distance_m"] / 1000.0, 2),
        eta_min=max(1, int(chosen_road["time_ms"] / 60000.0)),
        segments=chosen["segments"],
        overall_risk=chosen_overall,
        recommendation=rec,
        rerouted=rerouted,
        alternatives=alternatives,
    )


def _recommendation_for(overall: str, rerouted: bool) -> str:
    """Pick a natural-language tip for the chosen route."""
    if rerouted:
        if overall == "low":
            return "Rerouted around flood-prone path. Your trip is now safe."
        if overall == "moderate":
            return "Rerouted around heavy flooding. This path has minor wet spots — watch the highlighted segments."
        # If we rerouted but it's still high/severe, all options were bad
        return "All available routes have flooding risk. Chose the least-risky path. Consider delaying."

    if overall == "severe":
        return "Strongly recommend delaying or finding alternate route. Heavy flooding likely."
    if overall == "high":
        return "Route has flood-prone segments. Consider delaying or alternate transport."
    if overall == "moderate":
        return "Mostly clear. Watch the highlighted segments."
    return "Route looks safe in the next 60-90 minutes."