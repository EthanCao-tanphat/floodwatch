"""Route agent — real road routing + auto-rerouting around floods.

Fetches up to 3 alternative routes from GraphHopper, scores each route
segment-by-segment, picks the safest route, and returns rejected alternatives
for dimmed/dashed display on the frontend map.
"""

import asyncio
import math
import sys
import time
from typing import Dict, List, Tuple

from models import (
    AlternativeRoute,
    ConfidenceLevel,
    Coord,
    EvidenceState,
    CoverageInfo,
    ForecastPoint,
    Passability,
    RiskEvidence,
    RiskLevel,
    RouteCandidate,
    RouteResponse,
    RouteSegment,
    RouteTimelinePoint,
    TravelMode,
)
from agents.forecast import forecast_segment
from services.graphhopper import fetch_road_routes, sample_route_points
from services.coverage_tiers import coverage_for_route
from services.openmeteo import fetch_rainfall, fetch_river_discharge, river_discharge_signal
from services.reports import list_reports as list_active_reports, report_evidence_for_segment
from services.tides import get_tide_level


Point = Tuple[float, float]  # (lat, lng)
RouteForecastInputs = Tuple[Dict, Dict, float]
UNAVAILABLE_ROUTE_FORECAST = "unavailable"
ACTIVE_RAIN_MM = 5.0
WARNING_RAIN_MM = 10.0
TIDE_PRESSURE_M = 1.4
REROUTE_SCORE_DELTA = 0.05
REROUTE_RISK_DELTA = 0.10
ROUTE_SCORE_SEGMENTS = 4
ROUTE_FORECAST_CONCURRENCY = 4
ROUTE_FAST_RESPONSE_BUDGET_SECONDS = 2.4
ROUTE_RAINFALL_TIMEOUT_SECONDS = 2.0
ROUTE_TIDE_TIMEOUT_SECONDS = 1.2

FALLBACK_SPEED_KMH = {
    "motorbike": 25,
    "car": 28,
    "walk": 5,
    "bicycle": 14,
    "transit": 18,
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


def _point_evidence_state(point: ForecastPoint) -> EvidenceState:
    return getattr(point, "evidence_state", "forecast")


def _has_tide_pressure(tide_level_m: float | None) -> bool:
    return tide_level_m is not None and tide_level_m >= TIDE_PRESSURE_M


def _has_susceptibility(evidence: RiskEvidence | None) -> bool:
    if not evidence:
        return False

    return (
        float(evidence.hotspot_proximity or 0.0) >= 0.35
        or (
            evidence.drainage_score is not None
            and float(evidence.drainage_score) <= 0.45
        )
    )


def _segment_evidence_state(
    point: ForecastPoint,
    report_summary: dict,
) -> EvidenceState:
    evidence = point.evidence
    report_bonus = float(report_summary.get("risk_bonus", 0.0))
    report_count = int(report_summary.get("report_count", 0))

    if report_count > 0 and report_bonus > 0:
        return "live"

    point_state = _point_evidence_state(point)

    if point_state == "unavailable":
        return "unavailable"

    if evidence and (
        float(evidence.rainfall_mm or 0.0) >= ACTIVE_RAIN_MM
        or _has_tide_pressure(evidence.tide_level_m)
    ):
        return "forecast"

    if point_state == "susceptibility" or _has_susceptibility(evidence):
        return "susceptibility"

    return "forecast"


def _route_evidence_state(states: List[EvidenceState]) -> EvidenceState:
    if not states:
        return "unavailable"

    if "live" in states:
        return "live"

    if "forecast" in states:
        return "forecast"

    if "susceptibility" in states:
        return "susceptibility"

    return "unavailable"


def _honest_probability(prob: float, evidence_state: EvidenceState) -> float:
    if evidence_state == "unavailable":
        return 0.0

    if evidence_state == "susceptibility":
        return min(prob, 0.24)

    return prob




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
    payload["report_age_min"] = report_summary.get("report_age_min")
    payload["risk_bearing_report_count"] = int(
        report_summary.get("risk_bearing_report_count", 0)
    )

    return RiskEvidence(**payload)


def _segment_evidence_summary(
    evidence_state: EvidenceState,
    evidence: RiskEvidence,
    risk_level: RiskLevel,
) -> str:
    if evidence_state == "unavailable":
        return "Live/model flood data unavailable for this segment."

    if evidence_state == "live" and evidence.report_count > 0:
        return f"Recent rider report evidence near this segment ({evidence.report_count} report(s))."

    if evidence_state == "susceptibility":
        return "Historical susceptibility only; not a detected flood."

    if float(evidence.rainfall_mm or 0.0) >= WARNING_RAIN_MM:
        return f"Forecast rainfall signal ({evidence.rainfall_mm:.1f}mm) supports {risk_level} risk."

    if _has_tide_pressure(evidence.tide_level_m):
        return f"Forecast tide-pressure signal ({evidence.tide_level_m:.2f}m) supports caution."

    if evidence.river_discharge_ratio is not None and evidence.river_discharge_ratio >= 1.25:
        return f"River discharge forecast signal ({evidence.river_discharge_ratio:.2f}x) supports caution."

    return "No active flood signal; model confidence depends on available route evidence."


def _route_evidence_summary(
    evidence_state: EvidenceState,
    segments: List[RouteSegment],
) -> str:
    report_count = sum(segment.evidence.report_count for segment in segments)
    max_rain = max((segment.evidence.rainfall_mm for segment in segments), default=0.0)
    max_tide = max(
        (
            segment.evidence.tide_level_m
            for segment in segments
            if segment.evidence.tide_level_m is not None
        ),
        default=None,
    )
    max_river_ratio = max(
        (
            segment.evidence.river_discharge_ratio
            for segment in segments
            if segment.evidence.river_discharge_ratio is not None
        ),
        default=None,
    )

    if evidence_state == "unavailable":
        return "Live/model flood data is unavailable for this route."

    if evidence_state == "live" and report_count > 0:
        return f"Route includes recent rider report evidence ({report_count} report(s))."

    if evidence_state == "susceptibility":
        return "Route risk is historical susceptibility only, not confirmed active flooding."

    if max_rain >= ACTIVE_RAIN_MM:
        return f"Forecast rainfall evidence is active on this route (up to {max_rain:.1f}mm)."

    if _has_tide_pressure(max_tide):
        return f"Forecast tide-pressure evidence is active on this route (up to {max_tide:.2f}m)."

    if max_river_ratio is not None and max_river_ratio >= 1.25:
        return f"River discharge forecast evidence is active on this route ({max_river_ratio:.2f}x)."

    return "No active flood signal is available for this route window."

TIMELINE_MINUTES = (0, 30, 60, 90)


def _fallback_forecast_point(reason: str, minutes_ahead: int = 60) -> ForecastPoint:
    """Low-confidence fallback so the demo does not hard-crash on API/rate-limit errors."""

    print(f"[route] Forecast fallback used: {reason}", file=sys.stderr)

    return ForecastPoint(
        minutes_ahead=minutes_ahead,
        probability=0.0,
        risk_score=0.0,
        rainfall_mm=0.0,
        risk_level="low",
        passability="unknown",
        confidence="low",
        evidence_state="unavailable",
        evidence=RiskEvidence(
            rainfall_mm=0.0,
            tide_level_m=None,
            hotspot_proximity=0.0,
            drainage_score=None,
            report_count=0,
            photo_confirmed=False,
        ),
    )


def _fallback_forecast_points(reason: str) -> List[ForecastPoint]:
    return [_fallback_forecast_point(reason, minutes_ahead=m) for m in TIMELINE_MINUTES]


def _rainfall_unavailable_data() -> Dict:
    return {
        "source": "rainfall unavailable within route response budget",
        "minutely_15": {"precipitation": [0.0] * 12},
        "hourly": {
            "precipitation": [0.0, 0.0, 0.0],
            "precipitation_probability": [],
        },
    }


def _point_for_time(points: List[ForecastPoint], minutes: int) -> ForecastPoint:
    """Pick the forecast point for a given timeline minute.

    Falls back to the closest available point if the forecast did not return
    the exact minute.
    """

    if not points:
        return _fallback_forecast_point("empty forecast points", minutes_ahead=minutes)

    for point in points:
        if point.minutes_ahead == minutes:
            return point

    return min(points, key=lambda p: abs(p.minutes_ahead - minutes))


def _best_confidence(points: List[ForecastPoint]) -> ConfidenceLevel:
    best: ConfidenceLevel = "low"

    for point in points:
        if _confidence_rank(point.confidence) > _confidence_rank(best):
            best = point.confidence

    return best


def _dominant_signal(
    rainfall_mm_max: float,
    tide_level_m: float | None,
    river_discharge_ratio: float | None,
    hotspot_proximity: float,
    drainage_score: float | None,
    report_count: int,
) -> str:
    signals: List[str] = []

    if rainfall_mm_max >= 20:
        signals.append("heavy rainfall")
    elif rainfall_mm_max >= 10:
        signals.append("rainfall")

    if tide_level_m is not None and tide_level_m >= 1.4:
        signals.append("tide pressure")

    if river_discharge_ratio is not None and river_discharge_ratio >= 1.25:
        signals.append("river discharge forecast")

    if hotspot_proximity >= 0.5:
        signals.append("historical hotspot")

    if drainage_score is not None and drainage_score <= 0.4:
        signals.append("weak drainage proxy")

    if report_count > 0:
        signals.append("recent rider report")

    return " + ".join(signals) if signals else "baseline route evidence"


def _timeline_recommendation(
    risk_level: RiskLevel,
    passability: Passability,
    evidence_state: EvidenceState,
    minutes_ahead: int,
    high_risk_segments: int,
    severe_segments: int,
) -> str:
    time_label = "now" if minutes_ahead == 0 else f"in about {minutes_ahead} minutes"

    if evidence_state == "unavailable":
        return "Live flood data is unavailable for this route window."

    if evidence_state == "susceptibility":
        return (
            f"No active flood signal {time_label}; this corridor has "
            "historical flood susceptibility."
        )

    if evidence_state == "live":
        if severe_segments > 0 or risk_level == "severe" or passability == "impassable":
            return (
                f"Recent rider reports indicate severe flooding {time_label}. "
                "Delay or choose another route."
            )

        return (
            f"Recent rider reports indicate possible slow-pass conditions {time_label}."
        )

    if severe_segments > 0 or risk_level == "severe" or passability == "impassable":
        return (
            f"Forecast signals may become severe {time_label}. "
            "At least one segment may be unsafe for motorbikes."
        )

    if high_risk_segments > 0 or risk_level == "high":
        return (
            f"Forecast flood risk may be high {time_label}. "
            "Consider the safer route or delay if rain increases."
        )

    if risk_level == "moderate":
        return (
            f"Forecast signals suggest possible slow-pass conditions {time_label}."
        )

    return f"No active flood signal {time_label} based on available forecast data."


def _future_risk_summary(peak: RouteTimelinePoint) -> str:
    if peak.evidence_state == "unavailable":
        return "Live flood forecast data is unavailable for this route."

    if peak.evidence_state == "susceptibility":
        return "No active flood signal; route has historical flood susceptibility."

    if peak.minutes_ahead == 0:
        return (
            f"Current peak risk is {peak.risk_level} "
            f"with {round(peak.flood_prob_max * 100)}% max segment risk."
        )

    return (
        f"Risk may peak at +{peak.minutes_ahead} min as {peak.risk_level} "
        f"with {round(peak.flood_prob_max * 100)}% max segment risk."
    )


def _route_timeline_score(timeline: List[RouteTimelinePoint]) -> float:
    """Risk-only score. Lower is better."""

    if not timeline:
        return 1.0

    peak = max(point.flood_prob_max for point in timeline)
    avg = sum(point.flood_prob_avg for point in timeline) / len(timeline)
    severe_count = sum(point.severe_segments for point in timeline)
    high_count = sum(point.high_risk_segments for point in timeline)

    return round(
        min(
            1.0,
            0.62 * peak
            + 0.25 * avg
            + min(0.10, severe_count * 0.02)
            + min(0.08, high_count * 0.01),
        ),
        3,
    )


ForecastCache = Dict[Tuple[float, float], asyncio.Task[List[ForecastPoint]]]


async def _route_forecast_inputs(from_: Coord, to: Coord) -> RouteForecastInputs:
    """Fetch live/model weather once for the route corridor.

    Segment scoring still varies by hotspot/drainage/report evidence, but this
    keeps one route request from making many external weather calls.
    """

    mid_lat = (from_.lat + to.lat) / 2
    mid_lng = (from_.lng + to.lng) / 2

    async def load_river_signal() -> Dict:
        try:
            return river_discharge_signal(
                await fetch_river_discharge(mid_lat, mid_lng, forecast_days=7)
            )
        except Exception:
            return {
                "river_discharge_m3s": None,
                "river_discharge_ratio": None,
                "river_signal": "unavailable",
            }

    async def load_tide_signal() -> float:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(get_tide_level),
                timeout=ROUTE_TIDE_TIMEOUT_SECONDS,
            )
        except Exception:
            # Keep the route answer fast and honest: no tide pressure signal
            # is better than blocking and then inventing active flooding.
            return 0.0

    rainfall_task = asyncio.create_task(fetch_rainfall(mid_lat, mid_lng, hours_ahead=3))
    river_task = asyncio.create_task(load_river_signal())
    tide_task = asyncio.create_task(load_tide_signal())

    try:
        rainfall_data = await asyncio.wait_for(
            rainfall_task,
            timeout=ROUTE_RAINFALL_TIMEOUT_SECONDS,
        )
    except Exception:
        rainfall_task.cancel()
        rainfall_data = _rainfall_unavailable_data()

    tide_now = await tide_task

    if river_task.done():
        try:
            river_data = river_task.result()
        except Exception:
            river_data = {
                "river_discharge_m3s": None,
                "river_discharge_ratio": None,
                "river_signal": "unavailable",
            }
    else:
        river_task.cancel()
        river_data = {
            "river_discharge_m3s": None,
            "river_discharge_ratio": None,
            "river_signal": "unavailable",
        }

    return rainfall_data, river_data, tide_now


async def _forecast_segment_midpoint(
    start: Point,
    end: Point,
    forecast_cache: ForecastCache,
    semaphore: asyncio.Semaphore,
    forecast_inputs: RouteForecastInputs | str | None,
) -> List[ForecastPoint]:
    """Score one road segment using the forecast at its midpoint.

    Returns multiple future points: now, +30, +60, +90.
    """

    mid_lat = (start[0] + end[0]) / 2
    mid_lng = (start[1] + end[1]) / 2
    cache_key = (round(mid_lat, 2), round(mid_lng, 2))

    cached = forecast_cache.get(cache_key)

    if cached is not None:
        return await cached

    if forecast_inputs == UNAVAILABLE_ROUTE_FORECAST:
        return _fallback_forecast_points("route forecast unavailable within fast response budget")

    async def load() -> List[ForecastPoint]:
        try:
            async with semaphore:
                if forecast_inputs is None:
                    forecast = await forecast_segment(mid_lat, mid_lng, horizon_min=90)
                else:
                    rainfall_data, river_data, tide_now = forecast_inputs
                    forecast = await forecast_segment(
                        mid_lat,
                        mid_lng,
                        horizon_min=90,
                        rainfall_data=rainfall_data,
                        river_data=river_data,
                        tide_now=tide_now,
                    )
        except Exception as exc:
            return _fallback_forecast_points(str(exc))

        if not forecast.points:
            return _fallback_forecast_points("forecast returned no points")

        return forecast.points

    task = asyncio.create_task(load())
    forecast_cache[cache_key] = task

    return await task

def _aggregate_route_timeline(
    segment_forecasts: List[List[ForecastPoint]],
    report_summaries: List[dict],
) -> List[RouteTimelinePoint]:
    timeline: List[RouteTimelinePoint] = []

    for minutes in TIMELINE_MINUTES:
        probs: List[float] = []
        forecast_points_at_time: List[ForecastPoint] = []

        rainfall_mm_max = 0.0
        tide_level_m: float | None = None
        hotspot_proximity_max = 0.0
        drainage_score_min: float | None = None
        river_discharge_ratio_max: float | None = None
        report_count_total = 0

        high_risk_segments = 0
        severe_segments = 0
        evidence_states: List[EvidenceState] = []

        for points, report_summary in zip(segment_forecasts, report_summaries):
            point = _point_for_time(points, minutes)
            forecast_points_at_time.append(point)
            evidence_state = _segment_evidence_state(point, report_summary)
            evidence_states.append(evidence_state)

            prob = min(
                1.0,
                max(
                    0.0,
                    _prob_from_point(point)
                    + float(report_summary.get("risk_bonus", 0.0)),
                ),
            )
            prob = _honest_probability(prob, evidence_state)

            probs.append(prob)

            if prob >= 0.55:
                high_risk_segments += 1

            if prob >= 0.80:
                severe_segments += 1

            evidence = point.evidence

            rainfall_mm_max = max(
                rainfall_mm_max,
                float(evidence.rainfall_mm if evidence else point.rainfall_mm or 0.0),
            )

            if evidence and evidence.tide_level_m is not None:
                tide_level_m = max(
                    float(tide_level_m or 0.0),
                    float(evidence.tide_level_m),
                )

            if evidence:
                hotspot_proximity_max = max(
                    hotspot_proximity_max,
                    float(evidence.hotspot_proximity or 0.0),
                )

                if evidence.drainage_score is not None:
                    drainage_score_min = (
                        float(evidence.drainage_score)
                        if drainage_score_min is None
                        else min(drainage_score_min, float(evidence.drainage_score))
                    )

                if evidence.river_discharge_ratio is not None:
                    river_discharge_ratio_max = (
                        float(evidence.river_discharge_ratio)
                        if river_discharge_ratio_max is None
                        else max(river_discharge_ratio_max, float(evidence.river_discharge_ratio))
                    )

            report_count_total += int(report_summary.get("report_count", 0))

        flood_prob_max = max(probs) if probs else 0.0
        flood_prob_avg = sum(probs) / len(probs) if probs else 0.0

        risk_level = _risk_for_prob(flood_prob_max)
        passability = _passability_for_prob(flood_prob_max)
        confidence = _best_confidence(forecast_points_at_time)
        evidence_state = _route_evidence_state(evidence_states)

        if evidence_state == "unavailable":
            passability = "unknown"
            confidence = "low"
        elif evidence_state == "susceptibility":
            confidence = "low"

        dominant_signal = _dominant_signal(
            rainfall_mm_max=rainfall_mm_max,
            tide_level_m=tide_level_m,
            river_discharge_ratio=river_discharge_ratio_max,
            hotspot_proximity=hotspot_proximity_max,
            drainage_score=drainage_score_min,
            report_count=report_count_total,
        )

        timeline.append(
            RouteTimelinePoint(
                minutes_ahead=minutes,
                flood_prob_max=round(flood_prob_max, 3),
                flood_prob_avg=round(flood_prob_avg, 3),
                risk_level=risk_level,
                passability=passability,
                confidence=confidence,
                evidence_state=evidence_state,
                high_risk_segments=high_risk_segments,
                severe_segments=severe_segments,
                rainfall_mm_max=round(rainfall_mm_max, 1),
                tide_level_m=round(tide_level_m, 2) if tide_level_m is not None else None,
                dominant_signal=dominant_signal,
                recommendation=_timeline_recommendation(
                    risk_level=risk_level,
                    passability=passability,
                    evidence_state=evidence_state,
                    minutes_ahead=minutes,
                    high_risk_segments=high_risk_segments,
                    severe_segments=severe_segments,
                ),
            )
        )

    return timeline

async def _score_route(
    road_points: List[Point],
    n_segments: int = ROUTE_SCORE_SEGMENTS,
    forecast_cache: ForecastCache | None = None,
    semaphore: asyncio.Semaphore | None = None,
    forecast_inputs: RouteForecastInputs | str | None = None,
) -> Tuple[
    List[RouteSegment],
    float,
    Passability,
    ConfidenceLevel,
    List[RouteTimelinePoint],
    RouteTimelinePoint,
    float,
    EvidenceState,
]:
    """Score one route.

    Returns:
        segments,
        60-min max flood probability,
        60-min passability,
        best confidence,
        route timeline,
        future peak timeline point,
        route risk score,
        route evidence state
    """

    chunks = sample_route_points(road_points, n_segments=n_segments)
    forecast_cache = forecast_cache if forecast_cache is not None else {}
    semaphore = semaphore if semaphore is not None else asyncio.Semaphore(ROUTE_FORECAST_CONCURRENCY)

    if not chunks:
        fallback_peak = RouteTimelinePoint(
            minutes_ahead=0,
            flood_prob_max=0.0,
            flood_prob_avg=0.0,
            risk_level="low",
            passability="unknown",
            confidence="low",
            evidence_state="unavailable",
            recommendation="No route geometry was available.",
        )
        return [], 0.0, "unknown", "low", [fallback_peak], fallback_peak, 1.0, "unavailable"

    segment_forecasts = await asyncio.gather(
        *[
            _forecast_segment_midpoint(
                start,
                end,
                forecast_cache,
                semaphore,
                forecast_inputs,
            )
            for start, end, _chunk in chunks
        ]
    )

    active_reports = list_active_reports()
    report_summaries = []

    for (start, end, _chunk), points in zip(chunks, segment_forecasts):
        display_point = _point_for_time(points, 60)
        report_summaries.append(
            report_evidence_for_segment(
                start,
                end,
                modeled_prob=_prob_from_point(display_point),
                reports=active_reports,
            )
        )

    timeline = _aggregate_route_timeline(segment_forecasts, report_summaries)

    future_peak = max(
        timeline,
        key=lambda p: (
            p.flood_prob_max,
            p.severe_segments,
            p.high_risk_segments,
            p.minutes_ahead,
        ),
    )

    segments: List[RouteSegment] = []
    max_prob = 0.0
    best_confidence: ConfidenceLevel = "low"
    segment_states: List[EvidenceState] = []

    for (start, end, chunk), points, report_summary in zip(
        chunks,
        segment_forecasts,
        report_summaries,
    ):
        # Use +60m as the default segment display because FloodWatch promises
        # a 30-60 minute rider warning window.
        forecast_point = _point_for_time(points, 60)

        evidence = _evidence_with_report_signal(
            forecast_point.evidence,
            report_summary,
        )
        evidence_state = _segment_evidence_state(forecast_point, report_summary)
        segment_states.append(evidence_state)

        prob = min(
            1.0,
            max(
                0.0,
                _prob_from_point(forecast_point)
                + float(report_summary.get("risk_bonus", 0.0)),
            ),
        )
        prob = _honest_probability(prob, evidence_state)

        risk_level = _risk_for_prob(prob)
        passability = _passability_for_prob(prob)

        if evidence_state == "unavailable":
            passability = "unknown"

        calibration_flags = list(report_summary.get("calibration_flags", []))
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
                evidence_state=evidence_state,
                evidence=evidence,
                evidence_summary=_segment_evidence_summary(
                    evidence_state,
                    evidence,
                    risk_level,
                ),
                calibration_flags=calibration_flags,
            )
        )

    overall_passability = _passability_for_prob(max_prob)
    evidence_state = _route_evidence_state(segment_states)

    if evidence_state == "unavailable":
        overall_passability = "unknown"
        best_confidence = "low"
    elif evidence_state == "susceptibility":
        best_confidence = "low"

    route_score = _route_timeline_score(timeline)

    return (
        segments,
        max_prob,
        overall_passability,
        best_confidence,
        timeline,
        future_peak,
        route_score,
        evidence_state,
    )

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
    if idx == 0:
        return "Fastest"
    if idx == safest_idx:
        return "Safest"
    return f"Alternative {idx + 1}"


def _street_summary_for(road: dict) -> str:
    streets = [
        str(street).strip()
        for street in road.get("streets", [])
        if str(street).strip()
    ]

    if not streets:
        return ""

    return "via " + " / ".join(streets[:3])


def _tradeoff_summary(
    idx: int,
    max_prob: float,
    fastest_eta_min: int,
    eta_min: int,
    recommended_idx: int,
    evidence_state: EvidenceState,
    reroute_benefit: bool,
) -> str:
    risk_pct = round(max_prob * 100)

    if reroute_benefit:
        extra = max(0, eta_min - fastest_eta_min)
        return f"+{extra} min, lower modeled flood evidence than fastest"

    if evidence_state == "unavailable":
        return "Live flood data unavailable"

    if evidence_state == "susceptibility":
        return "Historical flood susceptibility only"

    if idx == 0 and idx != recommended_idx:
        return f"Fastest, modeled risk {risk_pct}%"

    if max_prob < 0.25:
        return "No active flood signal"

    if max_prob < 0.55:
        return "Possible slow-pass conditions"

    if max_prob < 0.80:
        return "High-risk segment included"

    return "Severe flood exposure"



def _recommendation_for(
    overall_risk: RiskLevel,
    overall_passability: Passability,
    evidence_state: EvidenceState,
    reroute_benefit: bool,
    report_count: int,
    active_reason: str,
) -> str:
    """Human-readable route recommendation."""

    prefix = ""

    if reroute_benefit:
        prefix = "Selected because it lowers modeled flood evidence versus the fastest route. "

    if evidence_state == "unavailable":
        return (
            "Live flood data is unavailable for this route. "
            "Use normal road caution and check recent rider reports."
        )

    if evidence_state == "susceptibility":
        return (
            "No active flood signal is available. "
            "This corridor has historical flood susceptibility, so check conditions before riding."
        )

    if evidence_state == "live" and report_count > 0:
        if overall_passability == "impassable" or overall_risk == "severe":
            return prefix + "Recent rider reports indicate severe flooding. Delay or choose another route."

        if overall_passability == "avoid_for_motorbikes" or overall_risk == "high":
            return prefix + "Recent rider reports indicate difficult motorbike passability."

        return prefix + "Recent rider reports indicate possible slow-pass conditions."

    if overall_passability == "impassable" or overall_risk == "severe":
        return prefix + f"Forecast {active_reason} indicates severe flood risk. Delay or choose another route."

    if overall_passability == "avoid_for_motorbikes" or overall_risk == "high":
        return prefix + f"Forecast {active_reason} indicates high flood risk. Avoid this route if possible."

    if overall_passability == "slow_pass" or overall_risk == "moderate":
        return prefix + f"Forecast {active_reason} indicates possible slow-pass conditions."

    if overall_passability == "unknown":
        return prefix + "Insufficient live evidence. Proceed carefully and check rider reports."

    return prefix + "No active flood signal is detected on this route window."


def _active_reason_for(segments: List[RouteSegment]) -> str:
    report_count = sum(segment.evidence.report_count for segment in segments)
    max_rain = max((segment.evidence.rainfall_mm for segment in segments), default=0.0)
    max_river_ratio = max(
        (
            segment.evidence.river_discharge_ratio
            for segment in segments
            if segment.evidence.river_discharge_ratio is not None
        ),
        default=None,
    )
    max_tide = max(
        (
            segment.evidence.tide_level_m
            for segment in segments
            if segment.evidence.tide_level_m is not None
        ),
        default=None,
    )

    if report_count > 0:
        return "rider report evidence"

    if max_rain >= WARNING_RAIN_MM:
        return "rainfall"

    if _has_tide_pressure(max_tide):
        return "tide pressure"

    if max_river_ratio is not None and max_river_ratio >= 1.25:
        return "river discharge forecast"

    if max_rain >= ACTIVE_RAIN_MM:
        return "rainfall"

    return "signals"

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
    timeline: List[RouteTimelinePoint],
    future_peak: RouteTimelinePoint,
    route_score: float,
    evidence_state: EvidenceState,
    reroute_benefit: bool,
    travel_mode: TravelMode,
) -> RouteCandidate:
    eta_min = max(1, int(road["time_ms"] / 60000.0))
    risk = _risk_for_prob(max_prob)
    report_count = sum(segment.evidence.report_count for segment in segments)
    active_reason = _active_reason_for(segments)
    calibration_flags = sorted(
        {
            flag
            for segment in segments
            for flag in segment.calibration_flags
        }
    )

    return RouteCandidate(
        id=f"route_{idx}",
        label=_route_label(idx, recommended_idx, safest_idx),
        street_summary=_street_summary_for(road),
        distance_km=round(road["distance_m"] / 1000.0, 2),
        eta_min=eta_min,
        points=[Coord(lat=p[0], lng=p[1]) for p in road["points"]],
        segments=segments,
        overall_risk=risk,
        overall_passability=overall_passability,
        confidence=confidence,
        evidence_state=evidence_state,
        recommendation=_recommendation_for(
            risk,
            overall_passability,
            evidence_state,
            reroute_benefit,
            report_count,
            active_reason,
        ),
        flood_prob_max=round(max_prob, 3),
        is_recommended=(idx == recommended_idx),
        is_fastest=(idx == 0),
        is_safest=(idx == safest_idx),
        evidence_summary=_route_evidence_summary(evidence_state, segments),
        calibration_flags=calibration_flags,
        tradeoff_summary=_tradeoff_summary(
            idx,
            max_prob,
            fastest_eta_min,
            eta_min,
            recommended_idx,
            evidence_state,
            reroute_benefit,
        ),
        timeline=timeline,
        future_peak_risk=future_peak.risk_level,
        future_peak_min=future_peak.minutes_ahead,
        future_risk_summary=_future_risk_summary(future_peak),
        route_score=route_score,
        travel_mode=travel_mode,
    )


async def find_safe_route(
    from_: Coord,
    to: Coord,
    depart_at_min: int = 0,
    travel_mode: TravelMode = "motorbike",
) -> RouteResponse:
    """Find safest/recommended route and return all selectable candidates."""

    started_at = time.monotonic()
    roads_task = asyncio.create_task(fetch_road_routes(
        from_.lat,
        from_.lng,
        to.lat,
        to.lng,
        max_paths=3,
        travel_mode=travel_mode,
    ))
    forecast_inputs_task = asyncio.create_task(_route_forecast_inputs(from_, to))

    roads = await roads_task
    forecast_cache: ForecastCache = {}
    forecast_semaphore = asyncio.Semaphore(ROUTE_FORECAST_CONCURRENCY)
    forecast_inputs: RouteForecastInputs | str | None = None

    try:
        forecast_budget_remaining = ROUTE_FAST_RESPONSE_BUDGET_SECONDS - (
            time.monotonic() - started_at
        )
        if forecast_budget_remaining <= 0:
            raise TimeoutError("route fast response budget exhausted")

        forecast_inputs = await asyncio.wait_for(
            forecast_inputs_task,
            timeout=forecast_budget_remaining,
        )
    except Exception:
        forecast_inputs = UNAVAILABLE_ROUTE_FORECAST

    # Fallback: straight-line route if GraphHopper is unavailable.
    if not roads:
        road_points = _straight_line_points(from_, to, n_points=7)

        (
            segments,
            max_prob,
            overall_passability,
            confidence,
            timeline,
            future_peak,
            route_score,
            evidence_state,
        ) = await _score_route(
            road_points,
            n_segments=ROUTE_SCORE_SEGMENTS,
            forecast_cache=forecast_cache,
            semaphore=forecast_semaphore,
            forecast_inputs=forecast_inputs,
        )

        distance_km = _haversine_km(from_.lat, from_.lng, to.lat, to.lng)
        speed = FALLBACK_SPEED_KMH.get(travel_mode, FALLBACK_SPEED_KMH["motorbike"])
        eta_min = max(1, int(distance_km / speed * 60))
        overall_risk = _risk_for_prob(max_prob)

        fallback_road = {
            "points": road_points,
            "distance_m": distance_km * 1000,
            "time_ms": eta_min * 60000,
            "streets": [],
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
            timeline=timeline,
            future_peak=future_peak,
            route_score=route_score,
            evidence_state=evidence_state,
            reroute_benefit=False,
            travel_mode=travel_mode,
        )

        return RouteResponse(
            distance_km=candidate.distance_km,
            eta_min=candidate.eta_min,
            segments=candidate.segments,
            overall_risk=overall_risk,
            overall_passability=candidate.overall_passability,
            confidence=candidate.confidence,
            evidence_state=candidate.evidence_state,
            recommendation=candidate.recommendation,
            evidence_summary=candidate.evidence_summary,
            calibration_flags=candidate.calibration_flags,
            rerouted=False,
            alternatives=[],
            routes=[candidate],
            selected_route_id=candidate.id,
            recommended_route_id=candidate.id,
            fastest_route_id=candidate.id,
            safest_route_id=candidate.id,
            coverage=_coverage_info_for(road_points),
            timeline=candidate.timeline,
            future_peak_risk=candidate.future_peak_risk,
            future_peak_min=candidate.future_peak_min,
            future_risk_summary=candidate.future_risk_summary,
            route_score=candidate.route_score,
            travel_mode=travel_mode,
        )

    scored = await asyncio.gather(
        *[
            _score_route(
                road["points"],
                n_segments=ROUTE_SCORE_SEGMENTS,
                forecast_cache=forecast_cache,
                semaphore=forecast_semaphore,
                forecast_inputs=forecast_inputs,
            )
            for road in roads
        ]
    )

    candidates_raw = []

    for idx, (road, score) in enumerate(zip(roads, scored)):
        (
            segments,
            max_prob,
            overall_passability,
            confidence,
            timeline,
            future_peak,
            route_score,
            evidence_state,
        ) = score

        candidates_raw.append(
            {
                "idx": idx,
                "road": road,
                "segments": segments,
                "max_prob": max_prob,
                "overall_risk": _risk_for_prob(max_prob),
                "overall_passability": overall_passability,
                "confidence": confidence,
                "timeline": timeline,
                "future_peak": future_peak,
                "route_score": route_score,
                "evidence_state": evidence_state,
            }
        )

    fastest_eta_min = max(1, int(candidates_raw[0]["road"]["time_ms"] / 60000.0))
    fastest_score = float(candidates_raw[0]["route_score"])
    fastest_max_prob = float(candidates_raw[0]["max_prob"])

    # Safest = lowest future risk score.
    safest = min(candidates_raw, key=lambda c: (c["route_score"], c["idx"]))
    safest_idx = int(safest["idx"])

    # Recommended = safety-first, but do not accept a huge time penalty.
    for candidate in candidates_raw:
        eta_min = max(1, int(candidate["road"]["time_ms"] / 60000.0))
        extra_ratio = max(0.0, eta_min - fastest_eta_min) / max(1, fastest_eta_min)
        candidate["recommendation_score"] = float(candidate["route_score"]) + min(
            0.20,
            extra_ratio * 0.15,
        )

    recommended = min(
        candidates_raw,
        key=lambda c: (c["recommendation_score"], c["idx"]),
    )

    recommended_idx = int(recommended["idx"])

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
                timeline=candidate["timeline"],
                future_peak=candidate["future_peak"],
                route_score=float(candidate["route_score"]),
                evidence_state=candidate["evidence_state"],
                reroute_benefit=(
                    int(candidate["idx"]) != 0
                    and (
                        float(candidate["route_score"]) <= fastest_score - REROUTE_SCORE_DELTA
                        or float(candidate["max_prob"]) <= fastest_max_prob - REROUTE_RISK_DELTA
                    )
                ),
                travel_mode=travel_mode,
            )
        )

    selected = next(
        (route for route in route_candidates if route.id == f"route_{recommended_idx}"),
        route_candidates[0],
    )
    rerouted = selected.id != "route_0"

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
    safest_id = f"route_{safest_idx}"
    recommended_id = selected.id

    return RouteResponse(
        distance_km=selected.distance_km,
        eta_min=selected.eta_min,
        segments=selected.segments,
        overall_risk=selected.overall_risk,
        overall_passability=selected.overall_passability,
        confidence=selected.confidence,
        evidence_state=selected.evidence_state,
        recommendation=selected.recommendation,
        evidence_summary=selected.evidence_summary,
        calibration_flags=selected.calibration_flags,
        rerouted=rerouted,
        alternatives=alternatives,
        routes=route_candidates,
        selected_route_id=selected.id,
        recommended_route_id=recommended_id,
        fastest_route_id=fastest_id,
        safest_route_id=safest_id,
        coverage=_coverage_info_for([(p.lat, p.lng) for p in selected.points]),
        timeline=selected.timeline,
        future_peak_risk=selected.future_peak_risk,
        future_peak_min=selected.future_peak_min,
        future_risk_summary=selected.future_risk_summary,
        route_score=selected.route_score,
        travel_mode=travel_mode,
    )
