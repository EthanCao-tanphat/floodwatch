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
from models import ConfidenceLevel, EvidenceState, ForecastPoint, ForecastResponse, Passability, RiskEvidence, RiskLevel
from services.openmeteo import (
    fetch_rainfall,
    fetch_river_discharge,
    rainfall_in_window,
    river_discharge_signal,
)
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


def _risk_level(prob: float) -> RiskLevel:
    if prob < 0.25:
        return "low"
    if prob < 0.55:
        return "moderate"
    if prob < 0.80:
        return "high"
    return "severe"


def _passability(prob: float) -> Passability:
    if prob < 0.25:
        return "safe"
    if prob < 0.55:
        return "slow_pass"
    if prob < 0.80:
        return "avoid_for_motorbikes"
    return "impassable"


def _confidence(tier: int, rain: float, hist_freq: float, report_count: int = 0) -> ConfidenceLevel:
    signals = 0
    if tier == 1:
        signals += 1
    if rain >= 10:
        signals += 1
    if hist_freq >= 0.50:
        signals += 1
    if report_count > 0:
        signals += 1

    if signals >= 3:
        return "high"
    if signals >= 2:
        return "medium"
    return "low"


def _evidence_state(
    rain: float,
    tide_level_m: float,
    hist_freq: float,
    drainage_score: float,
    river_ratio: float | None = None,
) -> EvidenceState:
    if rain >= 5 or tide_factor(tide_level_m) >= 0.5 or (river_ratio or 0.0) >= 1.25:
        return "forecast"

    if hist_freq >= 0.35 or drainage_score <= 0.45:
        return "susceptibility"

    return "forecast"


def _active_probability(
    prob: float,
    state: EvidenceState,
) -> float:
    if state == "susceptibility":
        return min(prob, 0.24)

    return prob


def _flood_probability_tier1(
    rainfall_mm_30min: float,
    tide_level_m: float,
    drainage_score: float,
    historical_freq: float,
    river_ratio: float | None,
) -> float:
    """Full fusion — HCMC (Tier 1)."""
    river_pressure = max(0.0, min(1.0, ((river_ratio or 1.0) - 1.0) / 0.8))
    z = (
        -2.5
        + 0.09 * rainfall_mm_30min
        + 2.0 * tide_factor(tide_level_m)
        + 0.7 * river_pressure
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
    river_ratio: float | None,
) -> float:
    """Rainfall + drainage + (tide if coastal) + sparse hotspots — Tier 2."""
    river_pressure = max(0.0, min(1.0, ((river_ratio or 1.0) - 1.0) / 0.8))
    z = (
        -2.2
        + 0.08 * rainfall_mm_30min
        + (1.6 * tide_factor(tide_level_m) if coastal else 0.0)
        + 1.0 * river_pressure
        - 1.2 * drainage_score
        + 1.5 * historical_freq
    )
    return 1.0 / (1.0 + math.exp(-z))


def _flood_probability_tier3(
    rainfall_mm_30min: float,
    river_ratio: float | None,
) -> float:
    """Rainfall + river-discharge warning — Tier 3.

    NOT a calibrated street-flood prediction. Threshold above 20mm/30min
    or high GloFAS discharge creates a lower-confidence warning.
    Capped at 0.7 to signal lower confidence.
    """
    river_pressure = max(0.0, min(1.0, ((river_ratio or 1.0) - 1.0) / 0.8))
    z = -3.0 + 0.10 * rainfall_mm_30min + 1.1 * river_pressure
    return min(0.70, 1.0 / (1.0 + math.exp(-z)))


async def forecast_segment(
    lat: float,
    lng: float,
    horizon_min: int = 60,
    rainfall_data: Optional[Dict] = None,
    river_data: Optional[Dict] = None,
    tide_now: Optional[float] = None,
) -> ForecastResponse:
    """Run the appropriate tier's fusion model."""
    coverage = resolve_coverage(lat, lng)
    flood_data = _load_flood_data()
    if rainfall_data is None:
        rainfall_data = await fetch_rainfall(lat, lng, hours_ahead=3)

    if river_data is None:
        try:
            river_data = river_discharge_signal(
                await fetch_river_discharge(lat, lng, forecast_days=7)
            )
        except Exception:
            river_data = {
                "river_discharge_m3s": None,
                "river_discharge_ratio": None,
                "river_signal": "unavailable",
            }

    river_ratio = (
        float(river_data["river_discharge_ratio"])
        if river_data.get("river_discharge_ratio") is not None
        else None
    )
    if tide_now is None:
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
    states: List[EvidenceState] = []
    for minutes in (0, 30, 60, 90):
        if minutes > horizon_min:
            continue
        rain = rainfall_in_window(rainfall_data, minutes_from_now=minutes)
        max_rain = max(max_rain, rain)

        state = _evidence_state(rain, tide_now, hist_freq, drainage_score, river_ratio)
        states.append(state)

        if coverage["tier"] == 1:
            prob = _flood_probability_tier1(
                rain,
                tide_now,
                drainage_score,
                hist_freq,
                river_ratio,
            )
        elif coverage["tier"] == 2:
            prob = _flood_probability_tier2(
                rain,
                tide_now,
                drainage_score,
                hist_freq,
                coverage["coastal"],
                river_ratio,
            )
        else:
            prob = _flood_probability_tier3(rain, river_ratio)

        prob = _active_probability(prob, state)
        rounded_prob = round(prob, 3)
        confidence = _confidence(coverage["tier"], rain, hist_freq)

        if state == "susceptibility":
            confidence = "low"

        evidence = RiskEvidence(
            rainfall_mm=round(rain, 1),
            tide_level_m=round(tide_now, 2),
            river_discharge_m3s=river_data.get("river_discharge_m3s"),
            river_discharge_ratio=river_data.get("river_discharge_ratio"),
            river_signal=river_data.get("river_signal"),
            river_source="Open-Meteo GloFAS river discharge",
            hotspot_proximity=round(hist_freq, 3),
            drainage_score=round(drainage_score, 3),
            report_count=0,
            photo_confirmed=False,
        )
        points.append(
            ForecastPoint(
                minutes_ahead=minutes,
                probability=rounded_prob,
                risk_score=rounded_prob,
                rainfall_mm=round(rain, 1),
                risk_level=_risk_level(prob),
                passability=_passability(prob),
                confidence=confidence,
                evidence_state=state,
                evidence=evidence,
            )
        )

    # Tier-appropriate explanation
    city = coverage["city_name_en"] or "outside pilot cities"
    if coverage["tier"] == 1:
        if max_rain < 5 and hist_freq >= 0.35:
            evidence_note = "No active rain signal; hotspot/drainage data indicates historical susceptibility."
        else:
            evidence_note = "Forecast evidence includes active weather or tide pressure."

        explanation = (
            f"{city} (Tier 1, full model). "
            f"Tide {tide_now}m; {max_rain:.1f}mm rain in next {horizon_min}min; "
            f"GloFAS river signal {river_data.get('river_signal')}; "
            f"historical hotspot proximity {hist_freq:.0%}; "
            f"drainage score {drainage_score:.0%}. {evidence_note}"
        )
    elif coverage["tier"] == 2:
        tide_str = f"tide {tide_now}m; " if coverage["coastal"] else ""
        explanation = (
            f"{city} (Tier 2, rainfall + drainage). "
            f"{tide_str}{max_rain:.1f}mm rain in next {horizon_min}min; "
            f"GloFAS river signal {river_data.get('river_signal')}; "
            f"drainage score {drainage_score:.0%}."
        )
    else:
        explanation = (
            f"Outside pilot cities (Tier 3, rainfall + river-discharge warning only). "
            f"{max_rain:.1f}mm rain forecast in next {horizon_min}min; "
            f"GloFAS river signal {river_data.get('river_signal')}."
        )

    return ForecastResponse(
        lat=lat,
        lng=lng,
        district=coverage["city_id"] or "vietnam",
        points=points,
        evidence_state="forecast" if "forecast" in states else "susceptibility",
        explanation=explanation,
    )
