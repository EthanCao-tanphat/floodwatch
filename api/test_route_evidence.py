import unittest
from unittest.mock import AsyncMock, patch

from agents.route import find_safe_route
from models import (
    Coord,
    ForecastPoint,
    ForecastResponse,
    RiskEvidence,
    RouteSegment,
    RouteTimelinePoint,
)


ROAD = {
    "points": [
        (10.7376, 106.7245),
        (10.7500, 106.7300),
        (10.7700, 106.7400),
        (10.7900, 106.7500),
        (10.8100, 106.7600),
        (10.8300, 106.7660),
        (10.8506, 106.7714),
    ],
    "distance_m": 12000.0,
    "time_ms": 24 * 60 * 1000,
    "streets": ["Nguyen Thi Thap"],
}

ALT_ROAD = {
    **ROAD,
    "points": [(lat + 0.01, lng + 0.01) for lat, lng in ROAD["points"]],
    "distance_m": 14000.0,
    "time_ms": 28 * 60 * 1000,
    "streets": ["Nguyen Van Linh"],
}


def no_report(*_args, **_kwargs):
    return {"report_count": 0, "photo_confirmed": False, "risk_bonus": 0.0}


def forecast_response(
    prob: float,
    *,
    rain: float = 0.0,
    evidence_state: str = "forecast",
    hotspot: float = 0.0,
    drainage: float | None = None,
    confidence: str = "low",
) -> ForecastResponse:
    points = []

    for minutes in (0, 30, 60, 90):
        points.append(
            ForecastPoint(
                minutes_ahead=minutes,
                probability=prob,
                risk_score=prob,
                rainfall_mm=rain,
                risk_level="high" if prob >= 0.55 else "moderate" if prob >= 0.25 else "low",
                passability=(
                    "avoid_for_motorbikes"
                    if prob >= 0.55
                    else "slow_pass"
                    if prob >= 0.25
                    else "safe"
                ),
                confidence=confidence,
                evidence_state=evidence_state,
                evidence=RiskEvidence(
                    rainfall_mm=rain,
                    tide_level_m=1.0,
                    hotspot_proximity=hotspot,
                    drainage_score=drainage,
                    report_count=0,
                    photo_confirmed=False,
                ),
            )
        )

    return ForecastResponse(
        lat=10.7,
        lng=106.7,
        district="hcmc",
        points=points,
        evidence_state=evidence_state,
        explanation="test",
    )


def route_segment(prob: float, state: str = "forecast") -> RouteSegment:
    return RouteSegment(
        start=Coord(lat=10.7, lng=106.7),
        end=Coord(lat=10.8, lng=106.8),
        points=[],
        flood_prob=prob,
        risk_score=prob,
        risk_level="high" if prob >= 0.55 else "low",
        passability="avoid_for_motorbikes" if prob >= 0.55 else "safe",
        confidence="medium",
        evidence_state=state,
        evidence=RiskEvidence(rainfall_mm=20.0 if prob >= 0.55 else 0.0),
    )


def timeline_point(prob: float, state: str = "forecast") -> RouteTimelinePoint:
    return RouteTimelinePoint(
        minutes_ahead=60,
        flood_prob_max=prob,
        flood_prob_avg=prob,
        risk_level="high" if prob >= 0.55 else "low",
        passability="avoid_for_motorbikes" if prob >= 0.55 else "safe",
        confidence="medium",
        evidence_state=state,
        high_risk_segments=1 if prob >= 0.55 else 0,
        rainfall_mm_max=20.0 if prob >= 0.55 else 0.0,
        dominant_signal="rainfall" if prob >= 0.55 else "baseline route evidence",
    )


class RouteEvidenceTests(unittest.IsolatedAsyncioTestCase):
    def route_max_prob(self, result) -> float:
        return max((segment.flood_prob for segment in result.segments), default=0.0)

    async def test_weather_unavailable_does_not_invent_flood_warning(self):
        with (
            patch("agents.route.fetch_road_routes", new=AsyncMock(return_value=[ROAD])),
            patch("agents.route.forecast_segment", new=AsyncMock(side_effect=RuntimeError("offline"))),
            patch("agents.route.report_evidence_for_segment", side_effect=no_report),
        ):
            result = await find_safe_route(
                Coord(lat=10.7376, lng=106.7245),
                Coord(lat=10.8506, lng=106.7714),
            )

        self.assertEqual(result.evidence_state, "unavailable")
        self.assertEqual(result.overall_passability, "unknown")
        self.assertEqual(self.route_max_prob(result), 0.0)
        self.assertIn("unavailable", result.recommendation.lower())
        self.assertNotIn("wet", result.recommendation.lower())
        self.assertNotIn("unsafe", result.recommendation.lower())

    async def test_dry_hotspot_is_susceptibility_not_active_flood(self):
        response = forecast_response(
            0.42,
            rain=0.0,
            evidence_state="susceptibility",
            hotspot=0.8,
            drainage=0.35,
        )

        with (
            patch("agents.route.fetch_road_routes", new=AsyncMock(return_value=[ROAD])),
            patch("agents.route._route_forecast_inputs", new=AsyncMock(return_value=None)),
            patch("agents.route.forecast_segment", new=AsyncMock(return_value=response)),
            patch("agents.route.report_evidence_for_segment", side_effect=no_report),
        ):
            result = await find_safe_route(
                Coord(lat=10.7376, lng=106.7245),
                Coord(lat=10.8506, lng=106.7714),
            )

        self.assertEqual(result.evidence_state, "susceptibility")
        self.assertLessEqual(self.route_max_prob(result), 0.24)
        self.assertIn("historical", result.recommendation.lower())
        self.assertNotIn("wet", result.recommendation.lower())

    async def test_heavy_rain_creates_forecast_warning_with_risky_segments(self):
        response = forecast_response(
            0.62,
            rain=25.0,
            evidence_state="forecast",
            confidence="medium",
        )

        with (
            patch("agents.route.fetch_road_routes", new=AsyncMock(return_value=[ROAD])),
            patch("agents.route._route_forecast_inputs", new=AsyncMock(return_value=None)),
            patch("agents.route.forecast_segment", new=AsyncMock(return_value=response)),
            patch("agents.route.report_evidence_for_segment", side_effect=no_report),
        ):
            result = await find_safe_route(
                Coord(lat=10.7376, lng=106.7245),
                Coord(lat=10.8506, lng=106.7714),
            )

        self.assertEqual(result.evidence_state, "forecast")
        self.assertEqual(result.overall_risk, "high")
        self.assertIn("forecast", result.recommendation.lower())
        self.assertGreater(
            len([s for s in result.segments if s.risk_level == "high"]),
            0,
        )

    async def test_confirmed_rider_report_creates_live_evidence(self):
        response = forecast_response(0.05, rain=0.0, evidence_state="forecast")

        def report(*_args, **_kwargs):
            return {"report_count": 1, "photo_confirmed": True, "risk_bonus": 0.25}

        with (
            patch("agents.route.fetch_road_routes", new=AsyncMock(return_value=[ROAD])),
            patch("agents.route._route_forecast_inputs", new=AsyncMock(return_value=None)),
            patch("agents.route.forecast_segment", new=AsyncMock(return_value=response)),
            patch("agents.route.report_evidence_for_segment", side_effect=report),
        ):
            result = await find_safe_route(
                Coord(lat=10.7376, lng=106.7245),
                Coord(lat=10.8506, lng=106.7714),
            )

        self.assertEqual(result.evidence_state, "live")
        self.assertIn("rider reports", result.recommendation.lower())
        self.assertGreater(self.route_max_prob(result), 0.05)

    async def test_reroute_copy_requires_material_risk_reduction(self):
        fast_score = (
            [route_segment(0.30)],
            0.30,
            "slow_pass",
            "medium",
            [timeline_point(0.30)],
            timeline_point(0.30),
            0.30,
            "forecast",
        )
        tiny_better_score = (
            [route_segment(0.28)],
            0.28,
            "slow_pass",
            "medium",
            [timeline_point(0.28)],
            timeline_point(0.28),
            0.28,
            "forecast",
        )

        with (
            patch(
                "agents.route.fetch_road_routes",
                new=AsyncMock(return_value=[ROAD, {**ALT_ROAD, "time_ms": ROAD["time_ms"]}]),
            ),
            patch("agents.route._score_route", new=AsyncMock(side_effect=[fast_score, tiny_better_score])),
        ):
            result = await find_safe_route(
                Coord(lat=10.7376, lng=106.7245),
                Coord(lat=10.8506, lng=106.7714),
            )

        self.assertEqual(result.selected_route_id, "route_1")
        self.assertNotIn("lowers modeled", result.recommendation.lower())
        self.assertNotIn("higher-risk flood path", result.recommendation.lower())


if __name__ == "__main__":
    unittest.main()
