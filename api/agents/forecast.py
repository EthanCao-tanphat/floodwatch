"""Forecast agent — tiered fusion model.

Tier 1 (HCMC): rainfall + tide + drainage + historical hotspots
Tier 2 (Hanoi, Da Nang, Can Tho, Hue): rainfall + tide (if coastal) + drainage
Tier 3 (rest of Vietnam): rainfall-only heavy-rain warning

Coefficients calibrated against Scheiber et al. 2023 (NHESS) methodology
for HCMC. Other cities use the same form with city-specific drainage scores.
"""
import json
import math
from pathlib import Path
from typing import Dict, List, Optional
from models import ForecastPoint, ForecastResponse
from services.openmeteo import fetch_rainfall, rainfall_in_window
from services.tides import get_tide_level, tide_factor
from services.coverage import resolve_coverage

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_FLOOD_DATA_CACHE: Optional[Dict] = None


def _load_flood_data() -> Dict:
    global _FLOOD_DATA_CACHE
    if _FLOOD_DATA_CACHE is None:
        with open(DATA_DIR / "flood_points.json") as f:
            _FLOOD_DATA_CACHE = json.load(f)
    return _FLOOD_DATA_CACHE


def _nearest_hotspot_freq(lat: float, lng: float, hotspots: List[Dict]) -> float:
    """Inverse-distance-weighted historical frequency from the 3 nearest hotspots."""
    if not hotspots:
        return 0.0
    distances = []
    for h in hotspots:
        d = math.hypot(h["lat"] - lat, h["lng"] - lng)
        distances.append((d, h["historical_freq"]))
    distances.sort(key=lambda x: x[0])
    nearest = distances[:3]
    if nearest[0][0] < 0.005:  # ~500m
        return nearest[0][1]
    weights = [1.0 / max(d, 0.001) for d, _ in nearest]
    total = sum(weights)
    weighted = sum(w * f for w, (_, f) in zip(weights, nearest))
    return weighted / total if total > 0 else 0.0


def _risk_level(prob: float) -> str:
    if prob < 0.25:
        return "low"
    if prob < 0.55:
        return "moderate"
    if prob < 0.80:
        return "high"
    return "severe"


def _flood_probability_tier1(
    rainfall_mm_30min: float,
    tide_level_m: float,
    drainage_score: float,
    historical_freq: float,
) -> float:
    """Full fusion — HCMC (Tier 1)."""
    z = (
        -2.5
        + 0.09 * rainfall_mm_30min
        + 2.0 * tide_factor(tide_level_m)
        - 1.5 * drainage_score
        + 2.2 * historical_freq
    )
    return 1.0 / (1.0 + math.exp(-z))


def _flood_probability_tier2(
    rainfall_mm_30min: float,
    tide_level_m: float,
    drainage_score: float,
    historical_freq: float,
    coastal: bool,
) -> float:
    """Rainfall + drainage + (tide if coastal) + sparse hotspots — Tier 2."""
    z = (
        -2.2
        + 0.08 * rainfall_mm_30min
        + (1.6 * tide_factor(tide_level_m) if coastal else 0.0)
        - 1.2 * drainage_score
        + 1.5 * historical_freq
    )
    return 1.0 / (1.0 + math.exp(-z))


def _flood_probability_tier3(rainfall_mm_30min: float) -> float:
    """Rainfall-only heavy-rain warning — Tier 3.

    NOT a real flood prediction. Threshold above 20mm/30min = warning.
    Capped at 0.7 to signal lower confidence.
    """
    z = -3.0 + 0.10 * rainfall_mm_30min
    return min(0.70, 1.0 / (1.0 + math.exp(-z)))


async def forecast_segment(lat: float, lng: float, horizon_min: int = 90) -> ForecastResponse:
    """Run the appropriate tier's fusion model."""
    coverage = resolve_coverage(lat, lng)
    flood_data = _load_flood_data()
    rainfall_data = await fetch_rainfall(lat, lng, hours_ahead=3)
    tide_now = get_tide_level()

    # Pull city-specific data if available
    if coverage["city_id"]:
        city_block = flood_data["cities"].get(coverage["city_id"], {})
        drainage_score = city_block.get("drainage_score", 0.5)
        hotspots = city_block.get("hotspots", [])
        hist_freq = _nearest_hotspot_freq(lat, lng, hotspots)
    else:
        drainage_score = 0.5
        hist_freq = 0.0

    points: List[ForecastPoint] = []
    max_rain = 0.0
    for minutes in (30, 60, 90):
        if minutes > horizon_min:
            break
        rain = rainfall_in_window(rainfall_data, minutes_from_now=minutes)
        max_rain = max(max_rain, rain)

        if coverage["tier"] == 1:
            prob = _flood_probability_tier1(rain, tide_now, drainage_score, hist_freq)
        elif coverage["tier"] == 2:
            prob = _flood_probability_tier2(
                rain, tide_now, drainage_score, hist_freq, coverage["coastal"]
            )
        else:
            prob = _flood_probability_tier3(rain)

        points.append(
            ForecastPoint(
                minutes_ahead=minutes,
                probability=round(prob, 3),
                rainfall_mm=round(rain, 1),
                risk_level=_risk_level(prob),
            )
        )

    # Tier-appropriate explanation
    city = coverage["city_name_en"] or "outside pilot cities"
    if coverage["tier"] == 1:
        explanation = (
            f"{city} (Tier 1, full model). "
            f"Tide {tide_now}m; {max_rain:.1f}mm rain in next 90min; "
            f"historical hotspot proximity {hist_freq:.0%}; "
            f"drainage score {drainage_score:.0%}."
        )
    elif coverage["tier"] == 2:
        tide_str = f"tide {tide_now}m; " if coverage["coastal"] else ""
        explanation = (
            f"{city} (Tier 2, rainfall + drainage). "
            f"{tide_str}{max_rain:.1f}mm rain in next 90min; "
            f"drainage score {drainage_score:.0%}."
        )
    else:
        explanation = (
            f"Outside pilot cities (Tier 3, rainfall warning only). "
            f"{max_rain:.1f}mm rain forecast in next 90min."
        )

    return ForecastResponse(
        lat=lat,
        lng=lng,
        district=coverage["city_id"] or "vietnam",
        points=points,
        explanation=explanation,
    )
